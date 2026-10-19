import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  completarSerie,
  dashboardVisaoRepository,
  mesesDesde,
} from "../../src/modules/dashboard/dashboard-visao.repository";

// $queryRaw do Prisma é "preguiçoso": só executa quando recebe `then`. O mock imita isso e conta
// quantas consultas estão em andamento ao mesmo tempo.
const estado = vi.hoisted(() => ({ ativas: 0, maxima: 0, chamadas: 0 }));

vi.mock("../../src/database/prisma", () => {
  const zeros = (campos: string[]) => Object.fromEntries(campos.map((c) => [c, 0]));
  const totais = zeros([
    "alunos",
    "alunos_com_matricula",
    "matriculas",
    "cursos",
    "cursos_com_matricula",
  ]);
  const parcelas = zeros([
    "abertas_qtd",
    "abertas_valor",
    "vencidas_qtd",
    "vencidas_valor",
    "alunos_inadimplentes",
    "matriculas_inadimplentes",
    "dias_medio_atraso",
    "maior_atraso",
    "a_vencer_qtd",
    "a_vencer_valor",
    "a_vencer_30_qtd",
    "a_vencer_30_valor",
    "pagas_qtd",
    "pagas_valor",
    "prazo_medio_pagamento",
    "recebido_mes",
    "recebido_mes_anterior",
    "protestadas_qtd",
    "protestadas_valor",
    "renegociadas_qtd",
    "renegociadas_valor",
    "ticket_medio",
  ]);

  return {
    prisma: {
      $queryRaw: () => {
        const linhas = estado.chamadas === 0 ? [totais] : estado.chamadas === 1 ? [parcelas] : [];
        estado.chamadas += 1;
        return {
          then(ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) {
            estado.ativas += 1;
            estado.maxima = Math.max(estado.maxima, estado.ativas);
            return new Promise((resolve) =>
              setTimeout(() => {
                estado.ativas -= 1;
                resolve(linhas);
              }, 5),
            ).then(ok, erro);
          },
        };
      },
    },
  };
});

beforeEach(() => {
  estado.ativas = 0;
  estado.maxima = 0;
  estado.chamadas = 0;
});

describe("dashboardVisaoRepository.visaoGeral", () => {
  it("nunca roda mais de 3 consultas ao mesmo tempo (o pool do Prisma tem 5 conexões)", async () => {
    const visao = await dashboardVisaoRepository.visaoGeral(new Date(2026, 9, 16));

    expect(estado.chamadas).toBe(11);
    expect(estado.maxima).toBeLessThanOrEqual(3);
    expect(visao.indicadores.totalAlunos).toBe(0);
    expect(visao.matriculasPorMes).toHaveLength(12);
    expect(visao.aVencerPorMes).toHaveLength(6);
  });
});

describe("séries mensais", () => {
  it("mesesDesde gera meses consecutivos virando o ano", () => {
    expect(mesesDesde(new Date(2026, 10, 1), 4)).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });

  it("completarSerie preenche com zero os meses sem registro, na ordem", () => {
    const serie = completarSerie(["2026-01", "2026-02", "2026-03"], [{ mes: "2026-03", qtd: 5 }], {
      qtd: 0,
    });
    expect(serie).toEqual([
      { mes: "2026-01", qtd: 0 },
      { mes: "2026-02", qtd: 0 },
      { mes: "2026-03", qtd: 5 },
    ]);
  });
});
