import { describe, expect, it } from "vitest";
import {
  ParcelaVencidaDoAluno,
  somarEncargosPorAluno,
} from "../../src/modules/dashboard/encargos-devedores";

const hoje = new Date(2026, 10, 6); // 06/11/2026
const config = { multaPercentual: 2, jurosDiarioPercentual: 0.033, jurosContarDiaGeracao: true };

const parcela = (extra: Partial<ParcelaVencidaDoAluno>): ParcelaVencidaDoAluno => ({
  aluno_id: "a1",
  valor: 1000,
  vencimento: "2026-10-27", // 10 dias de atraso
  multa_legado: null,
  juros_legado: null,
  total_legado: null,
  ...extra,
});

describe("somarEncargosPorAluno (dashboard: vencido com multa e juros)", () => {
  it("calcula multa flat e juros pelos dias de atraso", () => {
    const r = somarEncargosPorAluno([parcela({})], hoje, config).get("a1");
    // multa 2% de 1000 = 20,00; juros 0,033% x 1000 x 10 dias = 3,30
    expect(r).toEqual({ multa: 20, juros: 3.3, total: 1023.3 });
  });

  it("usa o valor calculado pelo legado quando existe, sem recalcular", () => {
    const r = somarEncargosPorAluno(
      [parcela({ multa_legado: 50, juros_legado: 7, total_legado: 1057 })],
      hoje,
      config,
    ).get("a1");
    expect(r).toEqual({ multa: 50, juros: 7, total: 1057 });
  });

  it("soma as parcelas de cada aluno separadamente", () => {
    const r = somarEncargosPorAluno(
      [parcela({}), parcela({ vencimento: "2026-10-27" }), parcela({ aluno_id: "a2", valor: 500 })],
      hoje,
      config,
    );
    expect(r.get("a1")?.total).toBe(2046.6);
    expect(r.get("a2")?.total).toBe(511.65);
  });

  it("não troca de dia por fuso: vencimento de hoje-1 tem 1 dia de atraso", () => {
    const r = somarEncargosPorAluno([parcela({ vencimento: "2026-11-05" })], hoje, config).get(
      "a1",
    );
    expect(r?.juros).toBe(0.33);
  });
});
