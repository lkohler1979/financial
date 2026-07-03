import { describe, expect, it } from "vitest";
import {
  calcularDiasAtraso,
  calcularMultaJuros,
  ConfiguracaoFinanceira,
} from "../../src/modules/relatorios/calculo-financeiro";

const CONFIG_PADRAO: ConfiguracaoFinanceira = {
  multaPercentual: 2,
  jurosDiarioPercentual: 0.033,
  jurosContarDiaGeracao: true,
};

describe("calcularMultaJuros", () => {
  it("aplica o percentual de multa configurado sobre o valor bruto", () => {
    const resultado = calcularMultaJuros(213.64, 118, CONFIG_PADRAO);
    expect(resultado.multa).toBeCloseTo(4.27, 2);
  });

  it("soma valor bruto + multa + juros no total", () => {
    const resultado = calcularMultaJuros(100, 30, CONFIG_PADRAO);
    expect(resultado.total).toBeCloseTo(
      resultado.valorBruto + resultado.multa + resultado.juros,
      2,
    );
  });

  it("não aplica juros quando não há atraso", () => {
    const resultado = calcularMultaJuros(100, 0, CONFIG_PADRAO);
    expect(resultado.juros).toBe(0);
    expect(resultado.multa).toBeCloseTo(2, 2);
  });

  it("usa o percentual de juros configurado", () => {
    const resultado = calcularMultaJuros(100, 10, { ...CONFIG_PADRAO, jurosDiarioPercentual: 1 });
    expect(resultado.juros).toBeCloseTo(10, 2);
  });
});

describe("calcularDiasAtraso", () => {
  it("calcula os dias corridos entre o vencimento e a data de referência (contando o dia da geração)", () => {
    const dias = calcularDiasAtraso(new Date(2026, 2, 6), new Date(2026, 6, 2), true);
    expect(dias).toBe(118);
  });

  it("desconta um dia quando jurosContarDiaGeracao é false", () => {
    const dias = calcularDiasAtraso(new Date(2026, 2, 6), new Date(2026, 6, 2), false);
    expect(dias).toBe(117);
  });

  it("nunca retorna valor negativo para parcelas ainda não vencidas", () => {
    const dias = calcularDiasAtraso(new Date(2026, 6, 10), new Date(2026, 6, 2), true);
    expect(dias).toBe(0);
  });
});
