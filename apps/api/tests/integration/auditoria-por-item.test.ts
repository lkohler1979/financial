import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/database/prisma";
import { auditoriaRepository } from "../../src/modules/auditoria/auditoria.repository";

/** Banco de verdade: o histórico de um item (ex.: um aluno) vem filtrado por `entidadeId`. */
const execucao = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
let usuarioId: string;
const itemA = `item-a-${execucao}`;
const itemB = `item-b-${execucao}`;

beforeAll(async () => {
  usuarioId = (
    await prisma.usuario.create({
      data: { nome: `Usuário ${execucao}`, email: `u-${execucao}@exemplo.test`, senhaHash: "x" },
    })
  ).id;
  await prisma.auditoria.createMany({
    data: [
      { usuarioId, entidade: "AlunoTeste", entidadeId: itemA, acao: "CRIACAO" },
      { usuarioId, entidade: "AlunoTeste", entidadeId: itemA, acao: "ATUALIZACAO" },
      { usuarioId, entidade: "AlunoTeste", entidadeId: itemB, acao: "CRIACAO" },
    ],
  });
});

afterAll(async () => {
  await prisma.auditoria.deleteMany({ where: { usuarioId } });
  await prisma.usuario.deleteMany({ where: { id: usuarioId } });
  await prisma.$disconnect();
});

describe("auditoria filtrada por item (banco real)", () => {
  it("devolve só os registros do item pedido", async () => {
    const r = await auditoriaRepository.list({
      entidade: "AlunoTeste",
      entidadeId: itemA,
      page: 1,
      pageSize: 20,
    });
    expect(r.total).toBe(2);
    expect(r.data.every((a) => a.entidadeId === itemA)).toBe(true);
  });

  it("sem o filtro, traz os de todos os itens da entidade", async () => {
    const r = await auditoriaRepository.list({ entidade: "AlunoTeste", page: 1, pageSize: 20 });
    expect(r.total).toBeGreaterThanOrEqual(3);
  });
});
