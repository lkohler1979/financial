import { describe, expect, it } from "vitest";
import {
  dividirEmParcelas,
  encargosDaParcela,
  planejarRenegociacao,
  vencimentoDaNovaParcela,
  type ParcelaParaRenegociar,
} from "../../src/modules/cobranca/renegociacao";
import { ValidationError } from "../../src/shared/errors/app-error";

const config = { multaPercentual: 2, jurosDiarioPercentual: 0.033, jurosContarDiaGeracao: true };
const hoje = new Date(2026, 9, 22); // 22/10/2026
const utc = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));
const dia = (d: Date) => d.toISOString().slice(0, 10);

function parcela(extra: Partial<ParcelaParaRenegociar> = {}): ParcelaParaRenegociar {
  return {
    id: "p1",
    parcela: "1/12",
    codTitulo: "100",
    status: "EM_ABERTO",
    valor: 100,
    vencimento: utc(2026, 9, 22), // 30 dias de atraso em 22/10/2026
    ...extra,
  };
}

describe("dividirEmParcelas", () => {
  it("divide igual e a última absorve a diferença de centavos", () => {
    expect(dividirEmParcelas(100, 3)).toEqual([33.33, 33.33, 33.34]);
    expect(dividirEmParcelas(1000, 4)).toEqual([250, 250, 250, 250]);
    expect(dividirEmParcelas(0.05, 2)).toEqual([0.02, 0.03]);
  });

  it("a soma das parcelas é sempre o valor negociado", () => {
    for (const [valor, n] of [
      [1983.57, 7],
      [10.01, 3],
      [999.99, 12],
    ] as const) {
      const soma = dividirEmParcelas(valor, n).reduce((s, v) => s + Math.round(v * 100), 0);
      expect(soma).toBe(Math.round(valor * 100));
    }
  });
});

describe("vencimentoDaNovaParcela", () => {
  it("mesmo dia nos meses seguintes", () => {
    expect([0, 1, 2].map((i) => dia(vencimentoDaNovaParcela("2026-11-10", i)))).toEqual([
      "2026-11-10",
      "2026-12-10",
      "2027-01-10",
    ]);
  });

  it("dia 31 vira o último dia do mês curto e volta ao 31 quando existe", () => {
    expect([0, 1, 2, 3].map((i) => dia(vencimentoDaNovaParcela("2027-01-31", i)))).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
      "2027-04-30",
    ]);
    expect(dia(vencimentoDaNovaParcela("2028-01-30", 1))).toBe("2028-02-29"); // bissexto
  });

  it("passa de um ano para o outro", () => {
    expect(dia(vencimentoDaNovaParcela("2026-12-15", 13))).toBe("2028-01-15");
  });
});

describe("encargosDaParcela", () => {
  it("parcela vencida: multa 2% e juros por dia de atraso", () => {
    // 100 × 2% = 2,00 ; 100 × 0,033% × 30 dias = 0,99
    expect(encargosDaParcela(parcela(), hoje, config)).toEqual({
      multa: 2,
      juros: 0.99,
      total: 102.99,
    });
  });

  it("parcela que ainda não venceu não tem multa nem juros (inclusive no dia do vencimento)", () => {
    const aVencer = encargosDaParcela(parcela({ vencimento: utc(2026, 11, 22) }), hoje, config);
    expect(aVencer).toEqual({ multa: 0, juros: 0, total: 100 });
    const hojeVence = encargosDaParcela(parcela({ vencimento: utc(2026, 10, 22) }), hoje, config);
    expect(hojeVence.total).toBe(100);
  });

  it("usa os valores do legado quando existem (nunca recalcula)", () => {
    const e = encargosDaParcela(
      parcela({ multaLegado: 2.53, jurosLegado: 43.25, totalLegado: 172.3, valor: 126.52 }),
      hoje,
      config,
    );
    expect(e).toEqual({ multa: 2.53, juros: 43.25, total: 172.3 });
  });

  it("valores congelados no protesto têm precedência sobre os do legado", () => {
    const e = encargosDaParcela(
      parcela({
        multaProtesto: 5,
        jurosProtesto: 10,
        totalProtesto: 115,
        multaLegado: 1,
        jurosLegado: 1,
        totalLegado: 102,
      }),
      hoje,
      config,
    );
    expect(e).toEqual({ multa: 5, juros: 10, total: 115 });
  });
});

describe("planejarRenegociacao", () => {
  const entrada = { desconto: 0, numeroParcelas: 3, primeiroVencimento: "2026-11-10" };

  it("soma as parcelas (com multa e juros), aplica o desconto e gera as novas parcelas", () => {
    // Duas parcelas dos 12 títulos reais do CPF 005.011.945-17 (valores do legado).
    const plano = planejarRenegociacao(
      [
        parcela({
          id: "a",
          valor: 126.52,
          multaLegado: 2.53,
          jurosLegado: 43.25,
          totalLegado: 172.3,
        }),
        parcela({
          id: "b",
          valor: 126.52,
          multaLegado: 2.53,
          jurosLegado: 41.96,
          totalLegado: 171.01,
        }),
      ],
      { ...entrada, desconto: 43.31 },
      config,
      hoje,
    );

    expect(plano.valorOriginal).toBe(253.04);
    expect(plano.multa).toBe(5.06);
    expect(plano.juros).toBe(85.21);
    expect(plano.totalDevido).toBe(343.31);
    expect(plano.desconto).toBe(43.31);
    expect(plano.valorNegociado).toBe(300);
    expect(plano.novasParcelas.map((n) => [n.numero, dia(n.vencimento), n.valor])).toEqual([
      [1, "2026-11-10", 100],
      [2, "2026-12-10", 100],
      [3, "2027-01-10", 100],
    ]);
    expect(plano.novasParcelas.reduce((s, n) => s + n.valor, 0)).toBeCloseTo(plano.valorNegociado);
  });

  it("aceita parcela em protesto, mas recusa paga, renegociada e cancelada", () => {
    expect(() =>
      planejarRenegociacao([parcela({ status: "PROTESTADO" })], entrada, config, hoje),
    ).not.toThrow();
    for (const status of ["PAGO", "RENEGOCIADO", "CANCELADO"] as const) {
      expect(() => planejarRenegociacao([parcela({ status })], entrada, config, hoje)).toThrowError(
        /só parcelas ainda não pagas/,
      );
    }
  });

  it("recusa sem parcelas, nº de parcelas fora de 1–60, data passada e desconto inválido", () => {
    const ok = [parcela()];
    expect(() => planejarRenegociacao([], entrada, config, hoje)).toThrowError(
      "Selecione ao menos uma parcela",
    );
    for (const numeroParcelas of [0, 61, 1.5]) {
      expect(() =>
        planejarRenegociacao(ok, { ...entrada, numeroParcelas }, config, hoje),
      ).toThrowError(/número de parcelas/i);
    }
    expect(() =>
      planejarRenegociacao(ok, { ...entrada, primeiroVencimento: "2026-10-21" }, config, hoje),
    ).toThrowError(/passado/);
    expect(() =>
      planejarRenegociacao(ok, { ...entrada, primeiroVencimento: "2026-10-22" }, config, hoje),
    ).not.toThrow();
    expect(() => planejarRenegociacao(ok, { ...entrada, desconto: -1 }, config, hoje)).toThrowError(
      "O desconto não pode ser negativo",
    );
  });

  it("desconto igual ou maior que o total devido é recusado", () => {
    // total devido = 102,99
    expect(() =>
      planejarRenegociacao([parcela()], { ...entrada, desconto: 102.99 }, config, hoje),
    ).toThrowError(ValidationError);
    expect(
      planejarRenegociacao([parcela()], { ...entrada, desconto: 102.98 }, config, hoje)
        .valorNegociado,
    ).toBe(0.01);
  });
});
