import { describe, expect, it } from "vitest";
import {
  calcularDiasAtraso,
  calcularMultaJuros,
  calcularMultaJurosParcela,
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

describe("calcularMultaJurosParcela", () => {
  it("usa multa/juros/total do legado quando presentes, ignorando o cálculo próprio do Ethos", () => {
    const resultado = calcularMultaJurosParcela(
      { valor: 100, vencimento: new Date(2026, 2, 6), multaLegado: 3, jurosLegado: 12.5, totalLegado: 115.5 },
      new Date(2026, 6, 2),
      CONFIG_PADRAO,
    );
    expect(resultado).toEqual({ valorBruto: 100, multa: 3, juros: 12.5, total: 115.5 });
  });

  it("cai no cálculo próprio do Ethos quando não há valores do legado (parcela nunca sincronizada)", () => {
    const semLegado = calcularMultaJurosParcela(
      { valor: 213.64, vencimento: new Date(2026, 2, 6) },
      new Date(2026, 6, 2),
      CONFIG_PADRAO,
    );
    const direto = calcularMultaJuros(213.64, 118, CONFIG_PADRAO);
    expect(semLegado).toEqual(direto);
  });

  it("trata totalLegado null como 'não sincronizado' e calcula normalmente", () => {
    const resultado = calcularMultaJurosParcela(
      { valor: 100, vencimento: new Date(2026, 2, 6), multaLegado: null, jurosLegado: null, totalLegado: null },
      new Date(2026, 2, 6),
      CONFIG_PADRAO,
    );
    expect(resultado.juros).toBe(0);
    expect(resultado.multa).toBeCloseTo(2, 2);
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
