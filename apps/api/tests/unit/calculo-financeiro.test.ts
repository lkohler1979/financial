import { describe, expect, it } from "vitest";
import { calcularDiasAtraso, calcularMultaJuros } from "../../src/modules/relatorios/calculo-financeiro";

describe("calcularMultaJuros", () => {
  it("aplica 2% de multa flat sobre o valor bruto", () => {
    const resultado = calcularMultaJuros(213.64, 118);
    expect(resultado.multa).toBeCloseTo(4.27, 2);
  });

  it("soma valor bruto + multa + juros no total", () => {
    const resultado = calcularMultaJuros(100, 30);
    expect(resultado.total).toBeCloseTo(resultado.valorBruto + resultado.multa + resultado.juros, 2);
  });

  it("não aplica juros quando não há atraso", () => {
    const resultado = calcularMultaJuros(100, 0);
    expect(resultado.juros).toBe(0);
    expect(resultado.multa).toBeCloseTo(2, 2);
  });
});

describe("calcularDiasAtraso", () => {
  it("calcula os dias corridos entre o vencimento e a data de referência", () => {
    const dias = calcularDiasAtraso(new Date(2026, 2, 6), new Date(2026, 6, 2));
    expect(dias).toBe(118);
  });

  it("nunca retorna valor negativo para parcelas ainda não vencidas", () => {
    const dias = calcularDiasAtraso(new Date(2026, 6, 10), new Date(2026, 6, 2));
    expect(dias).toBe(0);
  });
});
