import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/database/prisma";
import { financeiroRepository } from "../../src/modules/financeiro/financeiro.repository";
import { titulosLegadoLoteService } from "../../src/modules/importacao-legado/titulos-legado-lote.service";
import {
  listarTitulosDoAluno,
  sincronizarTitulosDoAluno,
} from "../../src/modules/importacao-legado/titulos-legado.service";
import type {
  LegadoPessoaCurso,
  LegadoTituloDetalhe,
  LegadoTituloResumo,
} from "../../src/modules/sincronizacao-legado/legado-client";

/**
 * Banco de verdade (sem mock): títulos do legado que faltam no Ethos. O legado é simulado com
 * títulos no formato (e com os valores) que ele devolveu de verdade em 2026-10-23 — as taxas
 * "TAXA DE EXTENSÃO DE PRAZO 3 MESES" (tipo 83) da aluna do CPF 874.955.623-15 incluídas.
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
const cpf = cpfValido(String(Number(execucao.slice(-8))).padStart(9, "3"));
const codigoCursoA = `7${execucao.slice(-7)}`;
const nomeCursoA = `Pós em Engenharia ${execucao}`;
const codigoCursoB = `8${execucao.slice(-7)}`;
const nomeCursoB = `Terapia ${execucao}`;

let usuarioId: string;
let alunoId: string;
let cursoAId: string;
let cursoBId: string;
let matriculaAId: string;
let matriculaBId: string | null = null;

const ID_BASE = 90_000_000 + (Number(execucao.slice(-6)) % 1_000_000);
const cod = (n: number) => String(ID_BASE + n).padStart(11, "0");

function titulo(extra: Partial<LegadoTituloResumo> & { tituloId: string }): LegadoTituloResumo {
  return {
    alunocursoId: "000021000191",
    cursoNome: nomeCursoA,
    tituloDescricao: "Mensalidade - 1 / 1",
    tituloParcela: "1",
    tituloEstado: "Aberto",
    tituloValor: 126.52,
    tituloValorPago: 0,
    tituloDataVencimento: "2026-12-21 23:59:00",
    tituloDataPagamento: null,
    tituloDataBaixa: null,
    diasAtraso: 0,
    multaCalc: 0,
    jurosCalc: 0,
    totalCalc: 126.52,
    tipoTituloId: 2,
    tipoTituloNome: "Mensalidade",
    tituloObservacoes: null,
    cursocampusId: "0000000768",
    cursoSigla: "EST",
    ...extra,
  };
}

/** Os títulos que o legado "tem" para a pessoa. */
function titulosDoLegado(): LegadoTituloResumo[] {
  const taxa = {
    tipoTituloId: 83,
    tipoTituloNome: "TAXA DE EXTENSÃO DE PRAZO 3 MESES",
    tituloValor: 150,
    totalCalc: 150,
  };
  return [
    // Já está no Ethos (guardado sem os zeros à esquerda): não pode duplicar.
    titulo({ tituloId: cod(1), tituloEstado: "Pago", tituloValorPago: 126.52 }),
    // As taxas 83 do curso A, como o legado as devolveu (Pago e Alteracao).
    titulo({
      tituloId: cod(2),
      ...taxa,
      tituloDescricao: "TAXA DE EXTENSÃO DE PRAZO 3 MESES - 1 / 2",
      tituloParcela: "1 / 2",
      tituloEstado: "Pago",
      tituloValor: 75,
      tituloValorPago: 75,
      totalCalc: 75,
      tituloDataVencimento: "2025-03-25 23:59:00",
      tituloDataPagamento: "2025-03-25 10:00:00",
    }),
    titulo({
      tituloId: cod(3),
      ...taxa,
      tituloDescricao: "TAXA DE EXTENSÃO DE PRAZO 3 MESES - 2 / 2",
      tituloParcela: "2 / 2",
      tituloEstado: "Alteracao",
      tituloDataVencimento: "2025-03-25 23:59:00",
    }),
    // Curso que o aluno não tem no Ethos: fica solto.
    titulo({
      tituloId: cod(4),
      alunocursoId: "000022000167",
      cursoNome: nomeCursoB,
      cursocampusId: "0000000774",
      tituloDescricao: "Mensalidade - 1 / 18",
      tituloParcela: "1 / 18",
      tituloEstado: "Cancelado",
      tituloValor: 270,
      totalCalc: 270,
    }),
    // Sem data de vencimento válida: não dá para gravar.
    titulo({ tituloId: cod(5), tituloDataVencimento: null }),
  ];
}

const pessoaCursos: LegadoPessoaCurso[] = [
  {
    pesId: "00000099999",
    alunoId: "00000099999",
    nome: "Aluna Teste",
    cpf: "",
    alunocursoId: "000021000191",
    alunocursoSituacao: "",
    cursoId: `0000${codigoCursoA}`,
    cursoNome: nomeCursoA,
    cursoSigla: "EST",
    cursocampusId: "0000000768",
  },
];

function legadoSimulado(titulos: () => LegadoTituloResumo[]) {
  return {
    buscarPessoaPorCpf: async (cpfFormatado: string) =>
      cpfFormatado.replace(/\D/g, "") === cpf ? pessoaCursos : [],
    buscarTitulosPorPessoa: async () => titulos(),
    buscarInformacoesTitulo: async (id: string): Promise<LegadoTituloDetalhe | null> => {
      const t = titulos().find((x) => x.tituloId === id);
      if (!t) return null;
      return { ...t, descontoCalc: 0, boletoId: null, boletoHash: null, remessaId: null };
    },
  };
}

beforeAll(async () => {
  usuarioId = (
    await prisma.usuario.create({
      data: { nome: `Usuário ${execucao}`, email: `u-${execucao}@exemplo.test`, senhaHash: "x" },
    })
  ).id;
  cursoAId = (await prisma.curso.create({ data: { codigo: codigoCursoA, nome: nomeCursoA } })).id;
  cursoBId = (await prisma.curso.create({ data: { codigo: codigoCursoB, nome: nomeCursoB } })).id;
  alunoId = (await prisma.aluno.create({ data: { cpf, nome: `Aluna ${execucao}` } })).id;
  matriculaAId = (
    await prisma.matricula.create({
      data: { alunoId, cursoId: cursoAId, numeroMatricula: `${execucao}-A` },
    })
  ).id;
  // A parcela que já existia, com o código sem zeros à esquerda.
  await prisma.parcela.create({
    data: {
      matriculaId: matriculaAId,
      codTitulo: String(ID_BASE + 1),
      parcela: "1",
      vencimento: new Date("2026-12-21T00:00:00.000Z"),
      valor: 126.52,
      status: "PAGO",
    },
  });
});

afterAll(async () => {
  const mats = [matriculaAId, ...(matriculaBId ? [matriculaBId] : [])];
  await prisma.parcela.deleteMany({ where: { matriculaId: { in: mats } } });
  await prisma.tituloLegado.deleteMany({ where: { alunoId } });
  await prisma.matricula.deleteMany({ where: { id: { in: mats } } });
  await prisma.aluno.deleteMany({ where: { id: alunoId } });
  await prisma.curso.deleteMany({ where: { id: { in: [cursoAId, cursoBId] } } });
  await prisma.importacaoTitulosLote.deleteMany({ where: { usuarioId } });
  await prisma.usuario.deleteMany({ where: { id: usuarioId } });
  await prisma.$disconnect();
});

describe("títulos do legado que faltam (banco real)", () => {
  it("grava as taxas 83 como parcelas do curso que o aluno tem e o resto como título sem matrícula", async () => {
    const r = await sincronizarTitulosDoAluno(
      { id: alunoId, cpf },
      legadoSimulado(titulosDoLegado),
      usuarioId,
    );

    expect(r).toMatchObject({
      encontradoNoLegado: true,
      titulosNoLegado: 5,
      jaImportados: 1,
      parcelasNovas: 2,
      titulosSemMatricula: 1,
      ignorados: 1,
    });

    // Parcelas novas na matrícula A: as duas taxas (tipo 83), com o status vindo do Estado.
    const parcelas = await prisma.parcela.findMany({
      where: { matriculaId: matriculaAId },
      orderBy: { codTitulo: "asc" },
    });
    expect(parcelas).toHaveLength(3); // a que já existia + 2 taxas, sem duplicar a existente
    const taxas = parcelas.filter((p) => p.tipoTitulo === "TAXA DE EXTENSÃO DE PRAZO 3 MESES");
    expect(taxas.map((p) => [p.codTitulo, p.status, p.parcela])).toEqual([
      [cod(2), "PAGO", "1 / 2"],
      [cod(3), "RENEGOCIADO", "2 / 2"],
    ]);
    expect(taxas.every((p) => p.tipoTituloIdLegado === 83)).toBe(true);

    // Título do curso B (sem matrícula): guardado solto, status pelo Estado (Cancelado).
    const soltos = await prisma.tituloLegado.findMany({ where: { alunoId } });
    expect(soltos).toHaveLength(1);
    expect(soltos[0]).toMatchObject({
      codTitulo: cod(4),
      status: "CANCELADO",
      cursoLegadoNome: nomeCursoB,
      estadoLegado: "Cancelado",
    });
    expect(Number(soltos[0].valor)).toBe(270);
  });

  it("a ficha da matrícula mostra só as parcelas dela; a tela do aluno mostra tudo", async () => {
    const { data } = await financeiroRepository.list({
      matriculaId: matriculaAId,
      skip: 0,
      take: 50,
    });
    expect(data).toHaveLength(3);
    expect(data.some((p) => p.codTitulo === cod(4))).toBe(false);

    const { aluno, titulos } = await listarTitulosDoAluno(alunoId);
    expect(aluno.cpf).toBe(cpf);
    expect(titulos).toHaveLength(4);
    expect(titulos.filter((t) => t.origem === "MATRICULA")).toHaveLength(3);
    const solto = titulos.find((t) => t.origem === "SEM_MATRICULA");
    expect(solto?.codTitulo).toBe(cod(4));
    expect(solto?.matricula).toBeNull();
    // Em ordem de vencimento.
    const datas = titulos.map((t) => t.vencimento.getTime());
    expect(datas).toEqual([...datas].sort((a, b) => a - b));
  });

  it("rodar de novo não duplica nada", async () => {
    const r = await sincronizarTitulosDoAluno(
      { id: alunoId, cpf },
      legadoSimulado(titulosDoLegado),
      usuarioId,
    );
    expect(r.parcelasNovas).toBe(0);
    expect(r.jaImportados).toBe(3);
    expect(r.titulosSemMatricula).toBe(1); // o mesmo registro solto, atualizado
    expect(await prisma.parcela.count({ where: { matriculaId: matriculaAId } })).toBe(3);
    expect(await prisma.tituloLegado.count({ where: { alunoId } })).toBe(1);
  });

  it("quando o aluno passa a ter a matrícula do curso, o título solto vira parcela e deixa de ser solto", async () => {
    matriculaBId = (
      await prisma.matricula.create({
        data: { alunoId, cursoId: cursoBId, numeroMatricula: `${execucao}-B` },
      })
    ).id;

    const r = await sincronizarTitulosDoAluno(
      { id: alunoId, cpf },
      legadoSimulado(titulosDoLegado),
      usuarioId,
    );

    expect(r.parcelasNovas).toBe(1);
    expect(r.titulosSemMatricula).toBe(0);
    const p = await prisma.parcela.findFirstOrThrow({ where: { matriculaId: matriculaBId } });
    expect(p.codTitulo).toBe(cod(4));
    expect(p.status).toBe("CANCELADO");
    expect(await prisma.tituloLegado.count({ where: { alunoId } })).toBe(0);

    const { titulos } = await listarTitulosDoAluno(alunoId);
    expect(titulos).toHaveLength(4);
    expect(titulos.every((t) => t.origem === "MATRICULA")).toBe(true);
  });

  it("pessoa que não está no legado não grava nada", async () => {
    const r = await sincronizarTitulosDoAluno(
      { id: alunoId, cpf: cpfValido("111222333") },
      legadoSimulado(titulosDoLegado),
      usuarioId,
    );
    expect(r).toMatchObject({
      encontradoNoLegado: false,
      parcelasNovas: 0,
      titulosSemMatricula: 0,
    });
  });
});

describe("busca em lote dos títulos que faltam (banco real)", () => {
  it("percorre os alunos, grava o que falta e conclui com os totais", async () => {
    // Novo título só no legado: entra como parcela da matrícula A.
    const comNovo = () => [
      ...titulosDoLegado(),
      titulo({ tituloId: cod(6), tituloDescricao: "Mensalidade - 3 / 3", tituloParcela: "3 / 3" }),
    ];
    const lote = await prisma.importacaoTitulosLote.create({ data: { usuarioId, total: 1 } });

    await titulosLegadoLoteService.executar(lote.id, legadoSimulado(comNovo), [alunoId]);

    const depois = await prisma.importacaoTitulosLote.findUniqueOrThrow({ where: { id: lote.id } });
    expect(depois.status).toBe("CONCLUIDO");
    expect(depois.processados).toBe(1);
    expect(depois.parcelasNovas).toBe(1);
    expect(depois.alunosComErro).toBe(0);
    expect(depois.finalizadoEm).not.toBeNull();
    expect(
      await prisma.parcela.count({ where: { matriculaId: matriculaAId, codTitulo: cod(6) } }),
    ).toBe(1);
  });

  it("falha de um aluno vira problema do lote e não derruba os demais", async () => {
    const quebrado = {
      ...legadoSimulado(titulosDoLegado),
      buscarTitulosPorPessoa: async () => {
        throw new Error("legado respondeu algo inesperado");
      },
    };
    const lote = await prisma.importacaoTitulosLote.create({ data: { usuarioId, total: 1 } });

    await titulosLegadoLoteService.executar(lote.id, quebrado, [alunoId]);

    const depois = await prisma.importacaoTitulosLote.findUniqueOrThrow({ where: { id: lote.id } });
    expect(depois.status).toBe("CONCLUIDO");
    expect(depois.alunosComErro).toBe(1);
    expect(depois.problemas).toEqual([
      expect.objectContaining({ cpf, motivo: "legado respondeu algo inesperado" }),
    ]);
  });
});
