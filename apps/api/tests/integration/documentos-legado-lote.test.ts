import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/database/prisma";
import { documentosLegadoLoteRepository as repo } from "../../src/modules/importacao-legado/documentos-legado-lote.repository";
import { documentosLegadoLoteService } from "../../src/modules/importacao-legado/documentos-legado-lote.service";
import { matriculasRepository } from "../../src/modules/matriculas/matriculas.repository";

/**
 * Banco de verdade (sem mock): a seleção de alunos a partir de matrículas e o ciclo de vida do
 * lote (criar, cancelar, interromper). A consulta ao sistema legado em si não roda aqui (não há
 * legado no CI): ela é exercida manualmente e pelos testes da rotina por aluno.
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
let usuarioId: string;
let cursoId: string;
let outroCursoId: string;
const alunos: { id: string; nome: string }[] = [];
const matriculaIds: string[] = [];

beforeAll(async () => {
  usuarioId = (
    await prisma.usuario.create({
      data: {
        nome: `Usuário do teste ${execucao}`,
        email: `teste-${execucao}@exemplo.test`,
        senhaHash: "x",
      },
    })
  ).id;
  cursoId = (
    await prisma.curso.create({ data: { codigo: `L${execucao}`, nome: `Curso A ${execucao}` } })
  ).id;
  outroCursoId = (
    await prisma.curso.create({ data: { codigo: `M${execucao}`, nome: `Curso B ${execucao}` } })
  ).id;

  // Dois alunos: o primeiro com duas matrículas no curso A; o segundo com uma no A e uma no B.
  for (const [i, nome] of ["Ana", "Bruno"].entries()) {
    const base = String(Number(execucao.slice(-8)) + i * 7).padStart(9, "1");
    const aluno = await prisma.aluno.create({
      data: { cpf: cpfValido(base), nome: `${nome} do teste ${execucao}` },
    });
    alunos.push({ id: aluno.id, nome: aluno.nome });
  }
  const criar = async (alunoId: string, curso: string, numero: string) =>
    (await prisma.matricula.create({ data: { alunoId, cursoId: curso, numeroMatricula: numero } }))
      .id;
  matriculaIds.push(
    await criar(alunos[0].id, cursoId, `${execucao}-1`),
    await criar(alunos[0].id, cursoId, `${execucao}-2`),
    await criar(alunos[1].id, cursoId, `${execucao}-3`),
    await criar(alunos[1].id, outroCursoId, `${execucao}-4`),
  );
});

afterAll(async () => {
  await prisma.importacaoDocumentosLote.deleteMany({ where: { usuarioId } });
  await prisma.matricula.deleteMany({ where: { id: { in: matriculaIds } } });
  await prisma.aluno.deleteMany({ where: { id: { in: alunos.map((a) => a.id) } } });
  await prisma.curso.deleteMany({ where: { id: { in: [cursoId, outroCursoId] } } });
  await prisma.usuario.deleteMany({ where: { id: usuarioId } });
  await prisma.$disconnect();
});

describe("seleção dos alunos da busca em lote (banco real)", () => {
  it("por matrículas marcadas: cada aluno entra uma vez, mesmo com várias matrículas", async () => {
    const r = await matriculasRepository.alunosDasMatriculas(
      { ids: matriculaIds.slice(0, 2) },
      100,
    );
    expect(r.map((a) => a.id)).toEqual([alunos[0].id]);
  });

  it("por filtro: todas as matrículas da consulta, sem repetir aluno", async () => {
    const r = await matriculasRepository.alunosDasMatriculas({ filtros: { cursoId } }, 100);
    expect(r.map((a) => a.id).sort()).toEqual(alunos.map((a) => a.id).sort());
    const soB = await matriculasRepository.alunosDasMatriculas(
      { filtros: { cursoId: outroCursoId } },
      100,
    );
    expect(soB.map((a) => a.id)).toEqual([alunos[1].id]);
  });

  it("devolve limite + 1 para o serviço saber que passou do máximo", async () => {
    const r = await matriculasRepository.alunosDasMatriculas({ filtros: { cursoId } }, 1);
    expect(r).toHaveLength(2);
  });
});

describe("ciclo de vida do lote (banco real)", () => {
  it("cria o lote com um item pendente por aluno e entrega o próximo em ordem de nome", async () => {
    const lote = await repo.criar(
      usuarioId,
      alunos.map((a) => ({ id: a.id, nome: a.nome, cpf: "00000000000" })),
    );
    expect(lote).toMatchObject({ status: "EM_ANDAMENTO", total: 2, processados: 0 });
    const primeiro = await repo.proximoPendente(lote.id);
    expect(primeiro?.alunoNome).toBe(alunos[0].nome);

    await repo.atualizarItem(primeiro!.id, { resultado: "CONCLUIDO", baixados: 2 });
    expect((await repo.proximoPendente(lote.id))?.alunoNome).toBe(alunos[1].nome);

    await documentosLegadoLoteService.cancelar(lote.id);
  });

  it("cancelar interrompe o lote e concluir não o sobrescreve", async () => {
    const lote = await repo.criar(usuarioId, [
      { id: alunos[0].id, nome: alunos[0].nome, cpf: "0" },
    ]);
    const cancelado = await documentosLegadoLoteService.cancelar(lote.id);
    expect(cancelado.status).toBe("CANCELADO");
    await repo.concluir(lote.id);
    expect((await repo.findById(lote.id))?.status).toBe("CANCELADO");
  });

  it("concluir fecha um lote em andamento", async () => {
    const lote = await repo.criar(usuarioId, [
      { id: alunos[0].id, nome: alunos[0].nome, cpf: "0" },
    ]);
    await repo.concluir(lote.id);
    const fechado = await repo.findById(lote.id);
    expect(fechado?.status).toBe("CONCLUIDO");
    expect(fechado?.finalizadoEm).not.toBeNull();
  });

  it("reiniciar o servidor marca o lote em andamento como interrompido", async (ctx) => {
    // A rotina age em TODOS os lotes em andamento: não roda se houver um lote real rodando.
    const reais = await prisma.importacaoDocumentosLote.count({
      where: { status: "EM_ANDAMENTO", usuarioId: { not: usuarioId } },
    });
    if (reais > 0) ctx.skip();
    const lote = await repo.criar(usuarioId, [
      { id: alunos[1].id, nome: alunos[1].nome, cpf: "0" },
    ]);
    await documentosLegadoLoteService.marcarInterrompidosPorReinicio();
    const interrompido = await repo.findById(lote.id);
    expect(interrompido?.status).toBe("FALHOU");
    expect(interrompido?.mensagemFalha).toMatch(/reiniciado/);
  });

  it("o relatório traz o resumo e um registro por aluno", async () => {
    const lote = await repo.criar(
      usuarioId,
      alunos.map((a) => ({ id: a.id, nome: a.nome, cpf: "00000000000" })),
    );
    const { arquivo, nome } = await documentosLegadoLoteService.relatorio(lote.id);
    expect(nome).toMatch(/^documentos-legado-.*\.xlsx$/);
    expect(arquivo.subarray(0, 2).toString()).toBe("PK"); // um .xlsx é um zip
    await documentosLegadoLoteService.cancelar(lote.id);
  });
});
