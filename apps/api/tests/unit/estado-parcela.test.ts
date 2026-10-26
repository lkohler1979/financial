import { describe, expect, it } from "vitest";
import {
  calcularEncargos,
  estadoDaParcela,
  type ParcelaParaEncargos,
} from "../../../web/src/app/features/cobranca/estado-parcela";

const agora = new Date(2026, 9, 22, 15, 30); // 22/10/2026, à tarde
const config = { multaPercentual: 2, jurosDiarioPercentual: 0.033, jurosContarDiaGeracao: true };

function parcela(extra: Partial<ParcelaParaEncargos> = {}): ParcelaParaEncargos {
  return {
    status: "EM_ABERTO",
    valor: 100,
    vencimento: "2026-09-22T00:00:00.000Z", // 30 dias antes de 22/10
    ...extra,
  };
}

describe("estadoDaParcela", () => {
  it("pago, cancelado, renegociado e protestos têm o estado do próprio status", () => {
    const rotulo = (status: ParcelaParaEncargos["status"]) =>
      estadoDaParcela(parcela({ status }), 0, agora).rotulo;
    expect(rotulo("PAGO")).toBe("Paga");
    expect(rotulo("CANCELADO")).toBe("Cancelada");
    expect(rotulo("RENEGOCIADO")).toBe("Renegociada");
    expect(rotulo("PROTESTADO")).toBe("Protestada");
    expect(rotulo("PROTESTO_ENVIADO")).toBe("Vencida e enviada para protesto");
  });

  it("em aberto: a vencer até o dia do vencimento; vencida depois", () => {
    const rotulo = (vencimento: string) =>
      estadoDaParcela(parcela({ vencimento }), 0, agora).rotulo;
    expect(rotulo("2026-11-22T00:00:00.000Z")).toBe("A vencer");
    expect(rotulo("2026-10-22T00:00:00.000Z")).toBe("A vencer"); // vence hoje, mesmo à tarde
    expect(rotulo("2026-10-21T00:00:00.000Z")).toBe("Vencida");
  });

  it("depois de N dias de atraso vira 'Vencida há mais de N dias'", () => {
    // 30 dias de atraso
    expect(estadoDaParcela(parcela(), 29, agora).rotulo).toBe("Vencida há mais de 29 dias");
    expect(estadoDaParcela(parcela(), 30, agora).rotulo).toBe("Vencida");
    expect(estadoDaParcela(parcela(), 0, agora).rotulo).toBe("Vencida");
  });
});

describe("calcularEncargos", () => {
  it("parcela vencida: multa 2% e juros por dia de atraso", () => {
    // 100 × 2% = 2,00 ; 100 × 0,033% × 30 dias = 0,99
    expect(calcularEncargos(parcela(), config, agora)).toEqual({
      multa: 2,
      juros: 0.99,
      total: 102.99,
    });
  });

  it("sem contar o dia de hoje, um dia a menos de juros", () => {
    // 29 dias: 100 × 0,033% × 29 = 0,957 → 0,96
    expect(calcularEncargos(parcela(), { ...config, jurosContarDiaGeracao: false }, agora)).toEqual(
      { multa: 2, juros: 0.96, total: 102.96 },
    );
  });

  it("não depende do fuso: o vencimento à meia-noite UTC conta como aquele dia", () => {
    // Antes da correção, contava um dia a mais (31 dias, juros 1,02).
    expect(calcularEncargos(parcela(), config, agora).juros).toBe(0.99);
  });

  it("parcela que ainda não venceu (ou vence hoje) não tem multa nem juros", () => {
    const sem = { multa: 0, juros: 0, total: 100 };
    expect(
      calcularEncargos(parcela({ vencimento: "2026-11-22T00:00:00.000Z" }), config, agora),
    ).toEqual(sem);
    expect(
      calcularEncargos(parcela({ vencimento: "2026-10-22T00:00:00.000Z" }), config, agora),
    ).toEqual(sem);
  });

  it("parcela do legado nunca é recalculada: usa multa, juros e total do legado", () => {
    // Título real do CPF 005.011.945-17 (valores do legado).
    const e = calcularEncargos(
      parcela({ valor: 126.52, multaLegado: 2.53, jurosLegado: 43.25, totalLegado: 172.3 }),
      config,
      agora,
    );
    expect(e).toEqual({ multa: 2.53, juros: 43.25, total: 172.3 });
  });

  it("valores congelados no protesto vencem os do legado", () => {
    const e = calcularEncargos(
      parcela({
        multaProtesto: 5,
        jurosProtesto: 10,
        totalProtesto: 115,
        multaLegado: 1,
        jurosLegado: 1,
        totalLegado: 102,
      }),
      config,
      agora,
    );
    expect(e).toEqual({ multa: 5, juros: 10, total: 115 });
  });
});
