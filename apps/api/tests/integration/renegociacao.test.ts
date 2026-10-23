import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/database/prisma";
import type { PlanoRenegociacao } from "../../src/modules/cobranca/renegociacao";
import { renegociacaoRepository } from "../../src/modules/cobranca/renegociacao.repository";
import { renegociacaoService } from "../../src/modules/cobranca/renegociacao.service";
import { financeiroRepository } from "../../src/modules/financeiro/financeiro.repository";
import { ConflictError, ValidationError } from "../../src/shared/errors/app-error";

/**
 * Banco de verdade (sem mock): renegociação de dívida pelo serviço. Cria só o mínimo (usuário,
 * curso, aluno, duas matrículas e suas parcelas) e apaga tudo no fim.
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
const dia = (d: Date) => d.toISOString().slice(0, 10);
const diasDepois = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};
const aaaaMmDd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

let usuarioId: string;
let cursoId: string;
let alunoId: string;
let matriculaId: string;
let outraMatriculaId: string;
// Parcelas da matrícula principal
let vencida: string; // EM_ABERTO, venceu há 30 dias
let aVencer: string; // EM_ABERTO, vence em 20 dias
let paga: string; // PAGO
let outraAberta: string; // EM_ABERTO, para uma segunda renegociação
let deOutraMatricula: string;

async function criarParcela(
  matId: string,
  cod: string,
  vencimento: Date,
  status: "EM_ABERTO" | "PAGO",
) {
  return (
    await prisma.parcela.create({
      data: {
        matriculaId: matId,
        codTitulo: `${cod}${execucao}`,
        parcela: cod,
        vencimento: new Date(`${dia(vencimento)}T00:00:00.000Z`),
        valor: 100,
        status,
      },
    })
  ).id;
}

beforeAll(async () => {
  usuarioId = (
    await prisma.usuario.create({
      data: { nome: `Usuário ${execucao}`, email: `u-${execucao}@exemplo.test`, senhaHash: "x" },
    })
  ).id;
  cursoId = (
    await prisma.curso.create({ data: { codigo: `R${execucao}`, nome: `Curso ${execucao}` } })
  ).id;
  alunoId = (
    await prisma.aluno.create({
      data: {
        cpf: cpfValido(String(Number(execucao.slice(-8))).padStart(9, "2")),
        nome: `Aluno ${execucao}`,
      },
    })
  ).id;
  matriculaId = (
    await prisma.matricula.create({ data: { alunoId, cursoId, numeroMatricula: `${execucao}-1` } })
  ).id;
  outraMatriculaId = (
    await prisma.matricula.create({ data: { alunoId, cursoId, numeroMatricula: `${execucao}-2` } })
  ).id;
  vencida = await criarParcela(matriculaId, "V", diasDepois(-30), "EM_ABERTO");
  aVencer = await criarParcela(matriculaId, "A", diasDepois(20), "EM_ABERTO");
  paga = await criarParcela(matriculaId, "P", diasDepois(-60), "PAGO");
  outraAberta = await criarParcela(matriculaId, "O", diasDepois(40), "EM_ABERTO");
  deOutraMatricula = await criarParcela(outraMatriculaId, "X", diasDepois(10), "EM_ABERTO");
});

afterAll(async () => {
  const mats = [matriculaId, outraMatriculaId];
  await prisma.historicoCobranca.deleteMany({ where: { matriculaId: { in: mats } } });
  await prisma.parcela.deleteMany({ where: { matriculaId: { in: mats } } });
  await prisma.renegociacao.deleteMany({ where: { matriculaId: { in: mats } } });
  await prisma.matricula.deleteMany({ where: { id: { in: mats } } });
  await prisma.aluno.deleteMany({ where: { id: alunoId } });
  await prisma.curso.deleteMany({ where: { id: cursoId } });
  await prisma.auditoria.deleteMany({ where: { usuarioId } });
  await prisma.usuario.deleteMany({ where: { id: usuarioId } });
  await prisma.$disconnect();
});

const primeiroVencimento = aaaaMmDd(diasDepois(15));

describe("renegociação de dívida (banco real)", () => {
  it("simular mostra os totais e as novas parcelas sem gravar nada", async () => {
    const plano = await renegociacaoService.simular(matriculaId, {
      parcelaIds: [vencida, aVencer],
      desconto: 0,
      numeroParcelas: 2,
      primeiroVencimento,
    });

    // vencida: 100 + multa 2% (2,00) + juros de 30 dias (100 × 0,033% × 30 = 0,99); a vencer: 100.
    expect(plano.valorOriginal).toBe(200);
    expect(plano.totalDevido).toBe(plano.valorOriginal + plano.multa + plano.juros);
    expect(plano.multa).toBe(2);
    expect(plano.juros).toBeGreaterThan(0);
    expect(plano.novasParcelas).toHaveLength(2);

    expect(await prisma.renegociacao.count({ where: { matriculaId } })).toBe(0);
    const p = await prisma.parcela.findUniqueOrThrow({ where: { id: vencida } });
    expect(p.status).toBe("EM_ABERTO");
  });

  let renegociacaoId: string;
  let valorNegociado: number;

  it("renegocia: quita as escolhidas, cria as novas e liga as duas pontas", async () => {
    const r = await renegociacaoService.renegociar(
      matriculaId,
      { parcelaIds: [vencida, aVencer], desconto: 10, numeroParcelas: 3, primeiroVencimento },
      usuarioId,
    );
    renegociacaoId = r.id;
    valorNegociado = Number(r.valorNegociado);

    expect(r.numero).toBe(1);
    expect(Number(r.desconto)).toBe(10);
    expect(Number(r.totalDevido) - 10).toBeCloseTo(valorNegociado, 2);

    // Parcelas escolhidas: estado RENEGOCIADO, ligadas à renegociação.
    const originais = await prisma.parcela.findMany({ where: { id: { in: [vencida, aVencer] } } });
    expect(originais.map((p) => p.status)).toEqual(["RENEGOCIADO", "RENEGOCIADO"]);
    expect(originais.every((p) => p.renegociadaEmId === r.id)).toBe(true);

    // Parcelas novas: em aberto, tipo Renegociação, mensais, somando o valor negociado.
    expect(r.parcelasGeradas.map((p) => p.codTitulo)).toEqual(["R1-1", "R1-2", "R1-3"]);
    expect(r.parcelasGeradas.map((p) => p.parcela)).toEqual(["1/3", "2/3", "3/3"]);
    expect(r.parcelasGeradas.every((p) => p.status === "EM_ABERTO")).toBe(true);
    expect(r.parcelasGeradas.every((p) => p.tipoTitulo === "Renegociação")).toBe(true);
    expect(dia(r.parcelasGeradas[0].vencimento)).toBe(primeiroVencimento);
    const soma = r.parcelasGeradas.reduce((s, p) => s + Math.round(Number(p.valor) * 100), 0);
    expect(soma).toBe(Math.round(valorNegociado * 100));

    // Histórico da matrícula.
    const historico = await prisma.historicoCobranca.findMany({ where: { matriculaId } });
    expect(historico).toHaveLength(1);
    expect(historico[0].acao).toMatch(/^Renegociação R1: 2 parcela\(s\)/);
  });

  it("a listagem da ficha mostra a rastreabilidade nos dois sentidos", async () => {
    const { data } = await financeiroRepository.list({ matriculaId, skip: 0, take: 50 });

    const original = data.find((p) => p.id === vencida);
    expect(original?.renegociadaEm?.id).toBe(renegociacaoId);
    expect(original?.renegociadaEm?.parcelasGeradas.map((p) => p.codTitulo)).toEqual([
      "R1-1",
      "R1-2",
      "R1-3",
    ]);

    const nova = data.find((p) => p.codTitulo === "R1-2");
    expect(nova?.origemRenegociacao?.numero).toBe(1);
    expect(nova?.origemRenegociacao?.parcelasOriginais.map((p) => p.id).sort()).toEqual(
      [vencida, aVencer].sort(),
    );

    // Parcela sem renegociação não tem vínculo.
    expect(data.find((p) => p.id === paga)?.renegociadaEm).toBeNull();
  });

  it("recusa parcela paga, já renegociada e de outra matrícula, sem gravar nada", async () => {
    const base = { desconto: 0, numeroParcelas: 2, primeiroVencimento };
    const antes = await prisma.parcela.count({ where: { matriculaId } });

    await expect(
      renegociacaoService.renegociar(matriculaId, { ...base, parcelaIds: [paga] }, usuarioId),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      renegociacaoService.renegociar(matriculaId, { ...base, parcelaIds: [vencida] }, usuarioId),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      renegociacaoService.renegociar(
        matriculaId,
        { ...base, parcelaIds: [deOutraMatricula] },
        usuarioId,
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(await prisma.parcela.count({ where: { matriculaId } })).toBe(antes);
    expect(await prisma.renegociacao.count({ where: { matriculaId } })).toBe(1);
    const p = await prisma.parcela.findUniqueOrThrow({ where: { id: deOutraMatricula } });
    expect(p.status).toBe("EM_ABERTO");
  });

  it("tudo ou nada: se uma parcela deixou de ser renegociável na hora de gravar, nada fica", async () => {
    // Plano feito quando a parcela paga ainda parecia em aberto: a gravação precisa barrar.
    const plano: PlanoRenegociacao = {
      parcelas: [
        {
          id: outraAberta,
          parcela: "O",
          codTitulo: "O",
          valor: 100,
          multa: 0,
          juros: 0,
          total: 100,
        },
        { id: paga, parcela: "P", codTitulo: "P", valor: 100, multa: 0, juros: 0, total: 100 },
      ],
      valorOriginal: 200,
      multa: 0,
      juros: 0,
      totalDevido: 200,
      desconto: 0,
      valorNegociado: 200,
      novasParcelas: [
        { numero: 1, vencimento: new Date(`${primeiroVencimento}T00:00:00Z`), valor: 200 },
      ],
    };

    await expect(
      renegociacaoRepository.efetivar({
        matriculaId,
        usuarioId,
        plano,
        numeroParcelas: 1,
        primeiroVencimento: new Date(`${primeiroVencimento}T00:00:00Z`),
        historico: () => "não deve ser gravado",
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    const aberta = await prisma.parcela.findUniqueOrThrow({ where: { id: outraAberta } });
    expect(aberta.status).toBe("EM_ABERTO");
    expect(aberta.renegociadaEmId).toBeNull();
    expect(await prisma.renegociacao.count({ where: { matriculaId } })).toBe(1);
    expect(
      await prisma.parcela.count({ where: { matriculaId, codTitulo: { startsWith: "R2-" } } }),
    ).toBe(0);
    expect(await prisma.historicoCobranca.count({ where: { matriculaId } })).toBe(1);
  });

  it("uma segunda renegociação recebe o número 2 e o código R2-n", async () => {
    const r = await renegociacaoService.renegociar(
      matriculaId,
      { parcelaIds: [outraAberta], desconto: 0, numeroParcelas: 1, primeiroVencimento },
      usuarioId,
    );
    expect(r.numero).toBe(2);
    expect(r.parcelasGeradas.map((p) => p.codTitulo)).toEqual(["R2-1"]);
    expect(Number(r.parcelasGeradas[0].valor)).toBe(100);
  });
});
