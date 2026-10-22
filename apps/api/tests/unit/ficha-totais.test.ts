import { describe, expect, it } from "vitest";
import {
  ParcelaParaTotais,
  situacaoAutomatica,
  totaisDaFicha,
} from "../../../web/src/app/features/cobranca/ficha-totais";

/**
 * Valores reais: os 12 títulos "Aberto" do CPF 005.011.945-17 como o legado devolveu em
 * `titulo-informacoes/{id}` (2026-10-22): valor 126,52, multa 2,53 e os juros de cada mês.
 * A soma dos `tituloValorFinal` do legado é 1.983,57.
 */
const JUROS_LEGADO = [
  43.25, 41.96, 40.67, 39.46, 38.16, 36.91, 35.61, 34.36, 33.07, 31.77, 30.52, 29.23,
];
const abertas: ParcelaParaTotais[] = JUROS_LEGADO.map((_, i) => ({
  status: "EM_ABERTO",
  valor: "126.52",
  vencimento: new Date(Date.UTC(2023, 11 + i, 21)).toISOString(),
  descontoLegado: 0,
}));
const encargosLegado = (p: ParcelaParaTotais) => ({
  multa: 2.53,
  juros: JUROS_LEGADO[abertas.indexOf(p)],
});
const hoje = new Date(2026, 9, 22);

describe("situacaoAutomatica", () => {
  const venc = (dia: string) => ({ vencimento: `${dia}T00:00:00.000Z` });

  it("paga → QUITADO; renegociada → QUITADO POR RENEGOCIAÇÃO", () => {
    expect(situacaoAutomatica({ status: "PAGO", ...venc("2023-01-10") }, hoje)).toBe("QUITADO");
    expect(situacaoAutomatica({ status: "RENEGOCIADO", ...venc("2023-05-06") }, hoje)).toBe(
      "QUITADO POR RENEGOCIAÇÃO",
    );
  });

  it("em aberto vencida → PENDENTE DE PAGAMENTO; em aberto a vencer → ABERTO", () => {
    expect(situacaoAutomatica({ status: "EM_ABERTO", ...venc("2023-12-21") }, hoje)).toBe(
      "PENDENTE DE PAGAMENTO",
    );
    expect(situacaoAutomatica({ status: "EM_ABERTO", ...venc("2026-11-21") }, hoje)).toBe("ABERTO");
  });

  it("vencendo hoje ainda é ABERTO (vence amanhã é a primeira pendente)", () => {
    expect(situacaoAutomatica({ status: "EM_ABERTO", ...venc("2026-10-22") }, hoje)).toBe("ABERTO");
    expect(situacaoAutomatica({ status: "EM_ABERTO", ...venc("2026-10-21") }, hoje)).toBe(
      "PENDENTE DE PAGAMENTO",
    );
  });

  it("cancelada e protestos ficam sem situação automática", () => {
    for (const status of ["CANCELADO", "PROTESTO_ENVIADO", "PROTESTADO"] as const) {
      expect(situacaoAutomatica({ status, ...venc("2023-12-21") }, hoje)).toBeNull();
    }
  });
});

describe("totaisDaFicha — CPF 005.011.945-17", () => {
  it("bate com o legado: R$ 1.983,57 com encargos e R$ 1.518,24 sem", () => {
    const t = totaisDaFicha(abertas, encargosLegado, hoje);
    expect(t).toEqual({
      totalJuros: 434.97,
      totalMultas: 30.36,
      totalDescontos: 0,
      qtdVencidos: 12,
      totalVencidos: 1518.24,
      qtdPagos: 0,
      totalFinalSemEncargos: 1518.24,
      totalFinalComEncargos: 1983.57,
    });
  });

  it("conta pagas e renegociadas, não as soma como dívida e abate descontos", () => {
    const extras: ParcelaParaTotais[] = [
      { status: "PAGO", valor: 49.9, vencimento: "2023-01-10T00:00:00.000Z" },
      { status: "RENEGOCIADO", valor: 116.22, vencimento: "2023-05-06T00:00:00.000Z" },
      { status: "CANCELADO", valor: 10, vencimento: "2023-05-06T00:00:00.000Z" },
      {
        status: "EM_ABERTO",
        valor: 100,
        vencimento: "2030-01-01T00:00:00.000Z",
        descontoLegado: 5,
      },
    ];
    const t = totaisDaFicha([...abertas, ...extras], (p) => encargosLegado(p) ?? {}, hoje);
    expect(t.qtdPagos).toBe(2);
    expect(t.qtdVencidos).toBe(12);
    expect(t.totalDescontos).toBe(5);
    expect(t.totalFinalSemEncargos).toBe(1613.24);
  });
});
