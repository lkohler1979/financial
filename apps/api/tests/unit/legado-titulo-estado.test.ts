import { describe, expect, it } from "vitest";
import {
  lerBoletoERemessa,
  parseDataLegadoQualquer,
} from "../../src/modules/sincronizacao-legado/legado-client";
import { mesclarDetalhes } from "../../src/modules/importacao-legado/importacao-legado.service";
import {
  aplicarDetalheNaParcela,
  statusLegadoParaEthos,
} from "../../src/modules/sincronizacao-legado/sincronizacao-legado.reconciliador";
import type {
  LegadoTituloDetalhe,
  LegadoTituloResumo,
} from "../../src/modules/sincronizacao-legado/legado-client";

const semData = { tituloDataPagamento: null, tituloDataBaixa: null };

describe("statusLegadoParaEthos — o Estado do legado define a situação", () => {
  it.each([
    ["Pago", "PAGO"],
    ["Pagamento Múltiplo", "PAGO"],
    ["pagamento multiplo", "PAGO"],
    ["Cancelado", "CANCELADO"],
    ["Alteracao", "RENEGOCIADO"],
  ])("%s -> %s, mesmo sem data de pagamento", (estado, esperado) => {
    expect(statusLegadoParaEthos({ tituloEstado: estado, ...semData })).toBe(esperado);
  });

  it("Aberto e Estorno não alteram a situação que o Ethos já controla", () => {
    expect(statusLegadoParaEthos({ tituloEstado: "Aberto", ...semData })).toBeNull();
    expect(statusLegadoParaEthos({ tituloEstado: "Estorno", ...semData })).toBeNull();
  });

  it("o Estado vale mais que a data: cancelado com data de baixa continua cancelado", () => {
    expect(
      statusLegadoParaEthos({
        tituloEstado: "Cancelado",
        tituloDataPagamento: null,
        tituloDataBaixa: "10/03/2021",
      }),
    ).toBe("CANCELADO");
  });

  it("o Estado vale mais que a data: Aberto com data de pagamento não vira PAGO", () => {
    expect(
      statusLegadoParaEthos({
        tituloEstado: "Aberto",
        tituloDataPagamento: "10/03/2021",
        tituloDataBaixa: null,
      }),
    ).toBeNull();
  });

  it("Estado desconhecido cai nas regras antigas (data de pagamento)", () => {
    expect(
      statusLegadoParaEthos({
        tituloEstado: "Algo novo",
        tituloDataPagamento: "10/03/2021",
        tituloDataBaixa: null,
      }),
    ).toBe("PAGO");
    expect(statusLegadoParaEthos({ tituloEstado: "Algo novo", ...semData })).toBeNull();
  });
});

describe("lerBoletoERemessa — titulo-informacoes", () => {
  it("lê boleto, hash e remessa (valores do título 364 e de um título com remessa)", () => {
    const hash = "c838c206d3e54c01f5e59db3fb82d40a1530c33843a2dcb1308c7c5a587bebce";
    expect(
      lerBoletoERemessa({
        bolId: "349",
        remessaId: null,
        boletos: [{ bol_id: "349", bol_id_hash: hash }],
      }),
    ).toEqual({ boletoId: "349", boletoHash: hash, remessaId: null });
    expect(lerBoletoERemessa({ bolId: "15421", remessaId: "0000000724", boletos: [] })).toEqual({
      boletoId: "15421",
      boletoHash: null,
      remessaId: "0000000724",
    });
  });

  it("escolhe o boleto cujo id é o bolId quando há mais de um", () => {
    expect(
      lerBoletoERemessa({
        bolId: "2",
        boletos: [
          { bol_id: "1", bol_id_hash: "hash-1" },
          { bol_id: "2", bol_id_hash: "hash-2" },
        ],
      }),
    ).toMatchObject({ boletoId: "2", boletoHash: "hash-2" });
  });

  it("título sem boleto (Estorno): bolId vazio e boletos vazio viram null", () => {
    expect(lerBoletoERemessa({ bolId: "", remessaId: "", boletos: [] })).toEqual({
      boletoId: null,
      boletoHash: null,
      remessaId: null,
    });
  });
});

function detalhe(extra: Partial<LegadoTituloDetalhe> = {}): LegadoTituloDetalhe {
  return {
    tituloId: "364",
    tituloDescricao: "Mensalidade - 1 / 1",
    tituloParcela: "1",
    tituloEstado: "Pago",
    tituloValor: 1782,
    tituloValorPago: 0,
    tituloDataVencimento: "10/03/2021",
    tituloDataPagamento: null,
    tituloDataBaixa: null,
    diasAtraso: 0,
    multaCalc: 0,
    jurosCalc: 0,
    totalCalc: 0,
    tipoTituloId: 2,
    tipoTituloNome: "Mensalidade",
    tituloObservacoes: "Pago com o Cupom 3149-2033-5390.",
    ...extra,
  };
}

const parcelaVazia = {
  status: "EM_ABERTO" as const,
  valorPago: 0,
  dataPagamento: null,
  tipoTitulo: "Mensalidade",
  tipoTituloIdLegado: 2,
  tituloObservacoesLegado: "Pago com o Cupom 3149-2033-5390.",
  multaLegado: 0,
  jurosLegado: 0,
  totalLegado: 0,
};

describe("aplicarDetalheNaParcela — Estado, boleto e remessa", () => {
  it("grava Estado, boleto, hash e remessa e passa a parcela para PAGO", () => {
    const r = aplicarDetalheNaParcela(
      parcelaVazia,
      detalhe({ boletoId: "349", boletoHash: "hash", remessaId: null }),
    );
    expect(r).toMatchObject({
      status: "PAGO",
      estadoLegado: "Pago",
      boletoLegadoId: "349",
      boletoLegadoHash: "hash",
      remessaLegadoId: null,
    });
  });

  it("sem consultar o detalhe (boleto indefinido) não apaga boleto nem remessa já gravados", () => {
    const r = aplicarDetalheNaParcela(
      { ...parcelaVazia, boletoLegadoId: "349", boletoLegadoHash: "h", remessaLegadoId: "7" },
      detalhe(),
    );
    expect(r).not.toBeNull();
    expect(r).not.toHaveProperty("boletoLegadoId");
    expect(r).not.toHaveProperty("remessaLegadoId");
  });

  it("nada mudou: devolve null", () => {
    const igual = {
      ...parcelaVazia,
      status: "PAGO" as const,
      estadoLegado: "Pago",
      boletoLegadoId: "349",
      boletoLegadoHash: "hash",
      remessaLegadoId: null,
    };
    expect(
      aplicarDetalheNaParcela(
        igual,
        detalhe({ boletoId: "349", boletoHash: "hash", remessaId: null }),
      ),
    ).toBeNull();
  });

  it("mudança só de remessa é detectada", () => {
    const base = {
      ...parcelaVazia,
      status: "PAGO" as const,
      estadoLegado: "Pago",
      boletoLegadoId: "349",
      boletoLegadoHash: "hash",
      remessaLegadoId: null,
    };
    expect(
      aplicarDetalheNaParcela(
        base,
        detalhe({ boletoId: "349", boletoHash: "hash", remessaId: "0000000724" }),
      ),
    ).toMatchObject({ remessaLegadoId: "0000000724" });
  });
});

describe("mesclarDetalhes — completa os títulos da busca em lote", () => {
  const titulo = (id: string, estado = "Aberto"): LegadoTituloResumo =>
    ({ tituloId: id, tituloEstado: estado, tituloObservacoes: null }) as LegadoTituloResumo;

  it("traz boleto, hash, remessa, Estado e Observações do detalhe", async () => {
    const avisos: string[] = [];
    const r = await mesclarDetalhes(
      [titulo("1"), titulo("2")],
      async (id) =>
        detalhe({
          tituloId: id,
          tituloEstado: "Pago",
          tituloObservacoes: `obs ${id}`,
          boletoId: `b${id}`,
          boletoHash: `h${id}`,
          remessaId: id === "2" ? "0000000724" : null,
        }),
      avisos,
    );
    expect(
      r.map((t) => [t.tituloId, t.tituloEstado, t.tituloObservacoes, t.boletoId, t.remessaId]),
    ).toEqual([
      ["1", "Pago", "obs 1", "b1", null],
      ["2", "Pago", "obs 2", "b2", "0000000724"],
    ]);
    expect(avisos).toEqual([]);
  });

  it("falha ou título não encontrado em um não derruba os outros e gera um aviso", async () => {
    const avisos: string[] = [];
    const r = await mesclarDetalhes(
      [titulo("1"), titulo("2"), titulo("3")],
      async (id) => {
        if (id === "1") throw new Error("legado caiu");
        if (id === "2") return null;
        return detalhe({ tituloId: id, boletoId: "b3", boletoHash: "h3", remessaId: null });
      },
      avisos,
    );
    expect(r[0].boletoId).toBeUndefined();
    expect(r[1].boletoId).toBeUndefined();
    expect(r[2].boletoId).toBe("b3");
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatch(/^2 título/);
  });

  it("consulta no máximo 6 detalhes ao mesmo tempo", async () => {
    let ativos = 0;
    let maximo = 0;
    await mesclarDetalhes(
      Array.from({ length: 20 }, (_, i) => titulo(String(i))),
      async (id) => {
        ativos++;
        maximo = Math.max(maximo, ativos);
        await new Promise((r) => setTimeout(r, 2));
        ativos--;
        return detalhe({ tituloId: id, boletoId: id, boletoHash: id, remessaId: null });
      },
      [],
    );
    expect(maximo).toBeLessThanOrEqual(6);
    expect(maximo).toBeGreaterThan(1);
  });
});

describe("parseDataLegadoQualquer — formatos do legado", () => {
  it("aceita DD/MM/AAAA (titulo-informacoes) e AAAA-MM-DD HH:mm:ss (busca em lote)", () => {
    expect(parseDataLegadoQualquer("05/06/2026")).toEqual(new Date(2026, 5, 5));
    expect(parseDataLegadoQualquer("2026-06-05 10:30:00")).toEqual(new Date(2026, 5, 5));
  });
  it("vazio ou formato desconhecido devolve null", () => {
    expect(parseDataLegadoQualquer(null)).toBeNull();
    expect(parseDataLegadoQualquer("")).toBeNull();
    expect(parseDataLegadoQualquer("ontem")).toBeNull();
  });
});

describe("aplicarDetalheNaParcela — Data Pagto e Data Baixa", () => {
  it("grava as duas datas quando preenchidas, e a data efetiva é a Data Pagto", () => {
    const r = aplicarDetalheNaParcela(
      parcelaVazia,
      detalhe({ tituloDataPagamento: "05/06/2026", tituloDataBaixa: "08/06/2026" }),
    );
    expect(r).toMatchObject({
      dataPagamento: new Date(2026, 5, 5),
      dataPagamentoLegado: new Date(2026, 5, 5),
      dataBaixaLegado: new Date(2026, 5, 8),
    });
  });

  it("só com Data Baixa: a data efetiva usa a baixa e Data Pagto fica vazia", () => {
    const r = aplicarDetalheNaParcela(parcelaVazia, detalhe({ tituloDataBaixa: "08/06/2026" }));
    expect(r).toMatchObject({
      dataPagamento: new Date(2026, 5, 8),
      dataPagamentoLegado: null,
      dataBaixaLegado: new Date(2026, 5, 8),
    });
  });

  it("a baixa de um título cancelado ou renegociado não vira data de pagamento", () => {
    for (const estado of ["Cancelado", "Alteracao"]) {
      const r = aplicarDetalheNaParcela(
        parcelaVazia,
        detalhe({ tituloEstado: estado, tituloDataBaixa: "08/06/2026" }),
      );
      expect(r).toMatchObject({
        dataPagamento: null,
        dataPagamentoLegado: null,
        dataBaixaLegado: new Date(2026, 5, 8),
      });
    }
  });

  it("entende as datas no formato da busca em lote (AAAA-MM-DD) — antes isso virava null", () => {
    const r = aplicarDetalheNaParcela(
      parcelaVazia,
      detalhe({ tituloDataPagamento: "2026-06-05 00:00:00" }),
    );
    expect(r).toMatchObject({ dataPagamento: new Date(2026, 5, 5) });
  });

  it("mudança só numa das datas é detectada; sem mudança devolve null", () => {
    const igual = {
      ...parcelaVazia,
      status: "PAGO" as const,
      valorPago: 0,
      dataPagamento: new Date(2026, 5, 5),
      estadoLegado: "Pago",
      dataPagamentoLegado: new Date(2026, 5, 5),
      dataBaixaLegado: null,
    };
    const base = detalhe({ tituloDataPagamento: "05/06/2026" });
    expect(aplicarDetalheNaParcela(igual, base)).toBeNull();
    expect(
      aplicarDetalheNaParcela(igual, { ...base, tituloDataBaixa: "09/06/2026" }),
    ).toMatchObject({ dataBaixaLegado: new Date(2026, 5, 9) });
  });
});
