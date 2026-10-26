import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/database/prisma";
import { alunosRepository } from "../../src/modules/alunos/alunos.repository";
import { alunosService } from "../../src/modules/alunos/alunos.service";

/**
 * Banco de verdade (sem mock): situação financeira, última matrícula e contadores da lista de
 * alunos. Cria quatro alunos de cenários diferentes e apaga tudo no fim; "hoje" é fixado.
 */

/** CPF válido (dígitos verificadores corretos) a partir de 9 dígitos. */
function cpfValido(base: string): string {
  const digito = (nums: number[]) => {
    const soma = nums.reduce((s, n, i) => s + n * (nums.length + 1 - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const nums = base.split("").map(Number);
  const d1 = digito(nums);
  return `${base}${d1}${digito([...nums, d1])}`;
}

const execucao = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const agora = new Date(2026, 9, 26, 15, 0); // 26/10/2026
const dia = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));

const ids: Record<"semMatricula" | "emAtraso" | "emDia" | "semParcelas", string> = {
  semMatricula: "",
  emAtraso: "",
  emDia: "",
  semParcelas: "",
};
let cursoA: string;
let cursoB: string;
const matriculas: string[] = [];

async function criarAluno(chave: keyof typeof ids, i: number) {
  ids[chave] = (
    await prisma.aluno.create({
      data: {
        cpf: cpfValido(String(Number(execucao.slice(-7)) * 10 + i).padStart(9, "4")),
        nome: `Aluno ${execucao} ${chave}`,
      },
    })
  ).id;
}

async function criarMatricula(alunoId: string, cursoId: string, dataMatricula: Date | null) {
  const m = await prisma.matricula.create({
    data: { alunoId, cursoId, dataMatricula, numeroMatricula: `${execucao}-${matriculas.length}` },
  });
  matriculas.push(m.id);
  return m.id;
}

beforeAll(async () => {
  cursoA = (await prisma.curso.create({ data: { codigo: `A${execucao}`, nome: "Pedagogia" } })).id;
  cursoB = (await prisma.curso.create({ data: { codigo: `B${execucao}`, nome: "Gestão" } })).id;
  await criarAluno("semMatricula", 1);
  await criarAluno("emAtraso", 2);
  await criarAluno("emDia", 3);
  await criarAluno("semParcelas", 4);

  // Em atraso: parcela em aberto vencida em 10/09/2026. Tem duas matrículas: a mais recente é a B.
  await criarMatricula(ids.emAtraso, cursoA, dia(2025, 2, 12));
  const mAtraso = await criarMatricula(ids.emAtraso, cursoB, dia(2026, 3, 5));
  await prisma.parcela.create({
    data: {
      matriculaId: mAtraso,
      codTitulo: "1",
      parcela: "1/2",
      vencimento: dia(2026, 9, 10),
      valor: 100,
    },
  });

  // Em dia: a parcela vencida está paga e a em aberto só vence amanhã (27/10).
  const mDia = await criarMatricula(ids.emDia, cursoA, null);
  await prisma.parcela.createMany({
    data: [
      {
        matriculaId: mDia,
        codTitulo: "1",
        parcela: "1/3",
        vencimento: dia(2026, 8, 10),
        valor: 100,
        status: "PAGO",
      },
      {
        matriculaId: mDia,
        codTitulo: "2",
        parcela: "2/3",
        vencimento: dia(2026, 9, 10),
        valor: 100,
        status: "RENEGOCIADO",
      },
      {
        matriculaId: mDia,
        codTitulo: "3",
        parcela: "3/3",
        vencimento: dia(2026, 10, 27),
        valor: 100,
      },
    ],
  });

  await criarMatricula(ids.semParcelas, cursoB, dia(2026, 1, 20));
});

afterAll(async () => {
  await prisma.parcela.deleteMany({ where: { matriculaId: { in: matriculas } } });
  await prisma.matricula.deleteMany({ where: { id: { in: matriculas } } });
  await prisma.aluno.deleteMany({ where: { id: { in: Object.values(ids) } } });
  await prisma.curso.deleteMany({ where: { id: { in: [cursoA, cursoB] } } });
  await prisma.$disconnect();
});

const listar = (
  extra: Parameters<typeof alunosRepository.list>[0] extends infer P ? Partial<P> : never,
) => alunosRepository.list({ busca: execucao, skip: 0, take: 50, ...extra }, agora);
const nomes = (r: Awaited<ReturnType<typeof listar>>) =>
  r.data.map((a) => a.nome.replace(`Aluno ${execucao} `, "")).sort();

describe("lista de alunos: situação financeira e última matrícula (banco real)", () => {
  it("calcula a situação de cada aluno", async () => {
    const r = await listar({});
    expect(r.total).toBe(4);
    const por = Object.fromEntries(
      r.data.map((a) => [a.nome.replace(`Aluno ${execucao} `, ""), a]),
    );
    expect(por.semMatricula.situacaoFinanceira).toBe("SEM_MATRICULA");
    expect(por.emAtraso.situacaoFinanceira).toBe("EM_ATRASO");
    // paga e renegociada vencidas não contam; a em aberto só vence amanhã
    expect(por.emDia.situacaoFinanceira).toBe("EM_DIA");
    expect(por.semParcelas.situacaoFinanceira).toBe("EM_DIA");
  });

  it("a última matrícula é a mais recente pela data; sem matrícula não tem", async () => {
    const r = await listar({});
    const por = Object.fromEntries(
      r.data.map((a) => [a.nome.replace(`Aluno ${execucao} `, ""), a]),
    );
    expect(por.emAtraso.totalMatriculas).toBe(2);
    expect(por.emAtraso.ultimaMatricula?.cursoNome).toBe("Gestão");
    expect(por.emAtraso.ultimaMatricula?.dataMatricula?.toISOString().slice(0, 10)).toBe(
      "2026-03-05",
    );
    expect(por.emDia.ultimaMatricula?.dataMatricula).toBeNull(); // matrícula sem data
    expect(por.semMatricula.ultimaMatricula).toBeNull();
    expect(por.semMatricula.totalMatriculas).toBe(0);
  });

  it("filtra por situação", async () => {
    expect(nomes(await listar({ situacao: "EM_ATRASO" }))).toEqual(["emAtraso"]);
    expect(nomes(await listar({ situacao: "SEM_MATRICULA" }))).toEqual(["semMatricula"]);
    expect(nomes(await listar({ situacao: "EM_DIA" }))).toEqual(["emDia", "semParcelas"]);
  });

  it("filtra por curso (qualquer matrícula do aluno)", async () => {
    expect(nomes(await listar({ cursoId: cursoB }))).toEqual(["emAtraso", "semParcelas"]);
    expect(nomes(await listar({ cursoId: cursoA, situacao: "EM_DIA" }))).toEqual(["emDia"]);
  });

  it("a busca continua funcionando junto com os filtros e a paginação conta o total", async () => {
    const r = await listar({ skip: 0, take: 2 });
    expect(r.total).toBe(4);
    expect(r.data).toHaveLength(2);
  });

  it("resumo do aluno: matrículas, curso atual e parcelas vencidas", async () => {
    const r = await alunosService.resumo(ids.emAtraso);
    expect(r.totalMatriculas).toBe(2);
    expect(r.ultimaMatricula?.cursoNome).toBe("Gestão");
    expect(r.situacaoFinanceira).toBe("EM_ATRASO");
    expect(r.parcelasVencidas).toBeGreaterThanOrEqual(1);
    const semMat = await alunosService.resumo(ids.semMatricula);
    expect(semMat).toMatchObject({
      totalMatriculas: 0,
      ultimaMatricula: null,
      parcelasVencidas: 0,
    });
  });

  it("os contadores do topo somam os grupos", async () => {
    const c = await alunosRepository.contadores(agora);
    expect(c.total).toBe(c.comMatricula + c.semMatricula);
    expect(c.comPendencias).toBeGreaterThanOrEqual(1);
    expect(c.comPendencias).toBeLessThanOrEqual(c.comMatricula);
  });
});
