import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/database/prisma";
import { matriculasRepository } from "../../src/modules/matriculas/matriculas.repository";
import { listarMatriculasSchema } from "../../src/modules/matriculas/matriculas.schema";

/**
 * Banco de verdade (sem mock): filtros e contadores da lista de matrículas. Cria dois alunos e três
 * matrículas de cenários diferentes e apaga tudo no fim; "hoje" é fixado.
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

let cursoA: string;
let cursoB: string;
let alunoAna: string;
let alunoBia: string;
const cpfAna = cpfValido(String(Number(execucao.slice(-7)) * 10 + 1).padStart(9, "5"));
const cpfBia = cpfValido(String(Number(execucao.slice(-7)) * 10 + 2).padStart(9, "5"));
const matriculaIds: string[] = [];
let mAtrasada: string; // contrato assinado, parcela vencida em aberto
let mEmDia: string; // contrato NÃO assinado, parcela só vence amanhã
let mSemParcelas: string; // contrato assinado, sem parcelas (aluna Bia)

async function criar(alunoId: string, cursoId: string, dados: { contratoAssinado: boolean }) {
  const m = await prisma.matricula.create({
    data: {
      alunoId,
      cursoId,
      ...dados,
      numeroMatricula: `${execucao}-${matriculaIds.length}`,
      dataMatricula: dia(2026, 3, 5),
    },
  });
  matriculaIds.push(m.id);
  return m.id;
}

beforeAll(async () => {
  cursoA = (await prisma.curso.create({ data: { codigo: `A${execucao}`, nome: "Pedagogia" } })).id;
  cursoB = (await prisma.curso.create({ data: { codigo: `B${execucao}`, nome: "Gestão" } })).id;
  alunoAna = (await prisma.aluno.create({ data: { cpf: cpfAna, nome: `Ana ${execucao}` } })).id;
  alunoBia = (await prisma.aluno.create({ data: { cpf: cpfBia, nome: `Bia ${execucao}` } })).id;

  mAtrasada = await criar(alunoAna, cursoA, { contratoAssinado: true });
  mEmDia = await criar(alunoAna, cursoB, { contratoAssinado: false });
  mSemParcelas = await criar(alunoBia, cursoA, { contratoAssinado: true });

  await prisma.parcela.create({
    data: {
      matriculaId: mAtrasada,
      codTitulo: "1",
      parcela: "1/1",
      vencimento: dia(2026, 9, 10),
      valor: 100,
    },
  });
  await prisma.parcela.createMany({
    data: [
      {
        matriculaId: mEmDia,
        codTitulo: "1",
        parcela: "1/2",
        vencimento: dia(2026, 8, 10),
        valor: 100,
        status: "PAGO",
      },
      {
        matriculaId: mEmDia,
        codTitulo: "2",
        parcela: "2/2",
        vencimento: dia(2026, 10, 27),
        valor: 100,
      },
    ],
  });
});

afterAll(async () => {
  await prisma.parcela.deleteMany({ where: { matriculaId: { in: matriculaIds } } });
  await prisma.matricula.deleteMany({ where: { id: { in: matriculaIds } } });
  await prisma.aluno.deleteMany({ where: { id: { in: [alunoAna, alunoBia] } } });
  await prisma.curso.deleteMany({ where: { id: { in: [cursoA, cursoB] } } });
  await prisma.$disconnect();
});

/** Lista só as matrículas do teste (os dois alunos), com os filtros dados. */
async function listar(filtros: Record<string, unknown> = {}) {
  const parseados = listarMatriculasSchema.parse(filtros);
  const { data } = await matriculasRepository.list(
    { ...parseados, alunoNome: execucao, skip: 0, take: 50 },
    agora,
  );
  return data.map((m) => m.id);
}

describe("filtros da lista de matrículas (banco real)", () => {
  it("'false' na query vale false (antes virava true e devolvia os assinados)", async () => {
    expect(listarMatriculasSchema.parse({ contratoAssinado: "false" }).contratoAssinado).toBe(
      false,
    );
    expect(listarMatriculasSchema.parse({ contratoAssinado: "true" }).contratoAssinado).toBe(true);
    expect(listarMatriculasSchema.parse({}).contratoAssinado).toBeUndefined();

    expect(await listar({ contratoAssinado: "false" })).toEqual([mEmDia]);
    expect((await listar({ contratoAssinado: "true" })).sort()).toEqual(
      [mAtrasada, mSemParcelas].sort(),
    );
  });

  it("filtra as matrículas com parcela vencida e não paga", async () => {
    expect(await listar({ comParcelaVencida: "true" })).toEqual([mAtrasada]);
    expect(await listar({})).toHaveLength(3);
  });

  it("nome e CPF juntos valem os dois filtros", async () => {
    const nomeAna = await matriculasRepository.list(
      { alunoNome: `Ana ${execucao}`, alunoCpf: cpfAna, skip: 0, take: 50 },
      agora,
    );
    expect(nomeAna.data.map((m) => m.id).sort()).toEqual([mAtrasada, mEmDia].sort());

    // Nome de uma aluna com o CPF da outra: nenhuma matrícula (antes o CPF apagava o nome).
    const cruzado = await matriculasRepository.list(
      { alunoNome: `Ana ${execucao}`, alunoCpf: cpfBia, skip: 0, take: 50 },
      agora,
    );
    expect(cruzado.total).toBe(0);
  });

  it("filtra por curso", async () => {
    expect((await listar({ cursoId: cursoA })).sort()).toEqual([mAtrasada, mSemParcelas].sort());
  });

  it("os contadores do topo são coerentes", async () => {
    const c = await matriculasRepository.contadores(agora);
    expect(c.total).toBeGreaterThanOrEqual(3);
    expect(c.comParcelaVencida).toBeGreaterThanOrEqual(1);
    expect(c.semContratoAssinado).toBeGreaterThanOrEqual(1);
    // Só limites inferiores, dos dados deste teste: cada contador é uma consulta própria e outros
    // testes de integração criam e apagam matrículas ao mesmo tempo no mesmo banco, então comparar
    // um contador com outro (ex.: vencidas <= total) dá falso erro.
  });
});
