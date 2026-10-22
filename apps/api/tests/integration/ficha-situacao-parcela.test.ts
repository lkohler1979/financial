import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/database/prisma";
import { fichaService } from "../../src/modules/cobranca/ficha.service";
import { financeiroRepository } from "../../src/modules/financeiro/financeiro.repository";
import { NotFoundError } from "../../src/shared/errors/app-error";

/**
 * Banco de verdade (sem mock): situação de cobrança de UMA parcela. Cria só o mínimo (usuário,
 * curso, aluno, duas matrículas com uma parcela cada e duas situações) e apaga tudo no fim.
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
let alunoId: string;
const matriculaIds: string[] = [];
const parcelaIds: string[] = [];
const situacaoIds: string[] = [];

beforeAll(async () => {
  usuarioId = (
    await prisma.usuario.create({
      data: { nome: `Usuário ${execucao}`, email: `u-${execucao}@exemplo.test`, senhaHash: "x" },
    })
  ).id;
  cursoId = (
    await prisma.curso.create({ data: { codigo: `S${execucao}`, nome: `Curso ${execucao}` } })
  ).id;
  alunoId = (
    await prisma.aluno.create({
      data: {
        cpf: cpfValido(String(Number(execucao.slice(-8))).padStart(9, "1")),
        nome: `Aluno ${execucao}`,
      },
    })
  ).id;
  for (const i of [1, 2]) {
    const m = await prisma.matricula.create({
      data: { alunoId, cursoId, numeroMatricula: `${execucao}-${i}` },
    });
    matriculaIds.push(m.id);
    const p = await prisma.parcela.create({
      data: {
        matriculaId: m.id,
        codTitulo: `T${execucao}${i}`,
        parcela: `${i}/2`,
        vencimento: new Date(2026, 9, 10),
        valor: 100,
      },
    });
    parcelaIds.push(p.id);
  }
  for (const nome of ["Negociando", "Aguardando contato"]) {
    situacaoIds.push(
      (
        await prisma.situacaoCobranca.create({
          data: { nome: `${nome} ${execucao}`, cor: "#123456" },
        })
      ).id,
    );
  }
});

afterAll(async () => {
  await prisma.historicoCobranca.deleteMany({ where: { matriculaId: { in: matriculaIds } } });
  await prisma.parcela.deleteMany({ where: { id: { in: parcelaIds } } });
  await prisma.matricula.deleteMany({ where: { id: { in: matriculaIds } } });
  await prisma.aluno.deleteMany({ where: { id: alunoId } });
  await prisma.curso.deleteMany({ where: { id: cursoId } });
  await prisma.situacaoCobranca.deleteMany({ where: { id: { in: situacaoIds } } });
  await prisma.usuario.deleteMany({ where: { id: usuarioId } });
  await prisma.$disconnect();
});

describe("situação de cobrança por parcela (banco real)", () => {
  it("grava a situação na parcela e ela aparece na listagem com nome e cor", async () => {
    await fichaService.mudarSituacaoParcela(
      matriculaIds[0],
      parcelaIds[0],
      situacaoIds[0],
      usuarioId,
    );

    const { data } = await financeiroRepository.list({
      matriculaId: matriculaIds[0],
      skip: 0,
      take: 10,
    });
    expect(data[0].situacaoCobrancaId).toBe(situacaoIds[0]);
    expect(data[0].situacaoCobranca).toMatchObject({ id: situacaoIds[0], cor: "#123456" });
    expect(data[0].situacaoCobranca?.nome).toContain("Negociando");
  });

  it("cada parcela tem a sua: a de outra matrícula não muda", async () => {
    const { data } = await financeiroRepository.list({
      matriculaId: matriculaIds[1],
      skip: 0,
      take: 10,
    });
    expect(data[0].situacaoCobrancaId).toBeNull();
    expect(data[0].situacaoCobranca).toBeNull();
  });

  it("registra no histórico da matrícula qual parcela mudou", async () => {
    await fichaService.mudarSituacaoParcela(
      matriculaIds[0],
      parcelaIds[0],
      situacaoIds[1],
      usuarioId,
    );
    const historico = await prisma.historicoCobranca.findMany({
      where: { matriculaId: matriculaIds[0] },
      orderBy: { data: "asc" },
    });
    expect(historico.map((h) => h.acao)).toEqual([
      expect.stringMatching(/^Parcela 1\/2 \(título T\d+1\): situação alterada para "Negociando/),
      expect.stringMatching(/situação alterada para "Aguardando contato/),
    ]);
  });

  it("null limpa a situação e também fica no histórico", async () => {
    await fichaService.mudarSituacaoParcela(matriculaIds[0], parcelaIds[0], null, usuarioId);
    const parcela = await prisma.parcela.findUniqueOrThrow({ where: { id: parcelaIds[0] } });
    expect(parcela.situacaoCobrancaId).toBeNull();
    const ultimo = await prisma.historicoCobranca.findFirst({
      where: { matriculaId: matriculaIds[0] },
      orderBy: { data: "desc" },
    });
    expect(ultimo?.acao).toMatch(/situação removida$/);
  });

  it("recusa parcela de outra matrícula e situação que não existe, sem alterar nada", async () => {
    await expect(
      fichaService.mudarSituacaoParcela(matriculaIds[0], parcelaIds[1], situacaoIds[0], usuarioId),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      fichaService.mudarSituacaoParcela(
        matriculaIds[0],
        parcelaIds[0],
        "00000000-0000-4000-8000-000000000000",
        usuarioId,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    const parcela = await prisma.parcela.findUniqueOrThrow({ where: { id: parcelaIds[1] } });
    expect(parcela.situacaoCobrancaId).toBeNull();
  });
});
