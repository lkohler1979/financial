import { describe, expect, it } from "vitest";
import {
  filtrarParcelas,
  opcoesDosFiltros,
  SEM_FILTROS,
  SEM_SITUACAO,
  SEM_TIPO,
  temFiltro,
  type ParcelaFiltravel,
} from "../../../web/src/app/features/cobranca/ficha-filtros";
import { estadoDaParcela } from "../../../web/src/app/features/cobranca/estado-parcela";

const hoje = new Date(2026, 10, 5); // 05/11/2026

type P = ParcelaFiltravel & { id: string };
const p = (id: string, extra: Partial<P> = {}): P => ({
  id,
  status: "EM_ABERTO",
  vencimento: "2026-09-10T00:00:00.000Z",
  tipoTitulo: "Mensalidade",
  situacaoCobranca: null,
  ...extra,
});

const estadoDe = (x: P) => estadoDaParcela(x, 0, hoje).rotulo;

// Uma matrícula com mistura: mensalidades pagas/vencidas/a vencer, uma taxa 83 e uma renegociação.
const parcelas: P[] = [
  p("1", { status: "PAGO" }),
  p("2"), // em aberto, vencida
  p("3", { vencimento: "2027-01-10T00:00:00.000Z" }), // a vencer
  p("4", { status: "RENEGOCIADO", tipoTitulo: "Renegociação" }),
  p("5", { tipoTitulo: "TAXA DE EXTENSÃO DE PRAZO 3 MESES", status: "CANCELADO" }),
  p("6", { status: "PROTESTADO", tipoTitulo: null, situacaoCobranca: { id: "s", nome: "Negociando", cor: "#000" } }),
  p("7", { status: "PROTESTADO", tipoTitulo: "Mensalidade" }),
];
const ids = (l: P[]) => l.map((x) => x.id);

describe("opções dos filtros", () => {
  it("só traz o que existe nas parcelas, ordenado", () => {
    const o = opcoesDosFiltros(parcelas, estadoDe, hoje);
    expect(o.estados).toEqual([
      "A vencer",
      "Cancelada",
      "Paga",
      "Protestada",
      "Renegociada",
      "Vencida",
    ]);
    expect(o.tipos).toEqual([
      "Mensalidade",
      "Renegociação",
      SEM_TIPO,
      "TAXA DE EXTENSÃO DE PRAZO 3 MESES",
    ]);
    // situação automática + a escolhida à mão (protesto) + "Sem situação" (protesto sem escolha)
    expect(o.situacoes).toEqual([
      "ABERTO",
      "CANCELADO",
      "Negociando",
      "PENDENTE DE PAGAMENTO",
      "QUITADO",
      "QUITADO POR RENEGOCIAÇÃO",
      SEM_SITUACAO,
    ]);
  });
});

describe("filtrarParcelas", () => {
  it("sem filtro devolve tudo", () => {
    expect(temFiltro(SEM_FILTROS)).toBe(false);
    expect(filtrarParcelas(parcelas, SEM_FILTROS, estadoDe, hoje)).toBe(parcelas);
  });

  it("por estado da parcela", () => {
    expect(ids(filtrarParcelas(parcelas, { ...SEM_FILTROS, estado: "Vencida" }, estadoDe, hoje))).toEqual(["2"]);
    expect(ids(filtrarParcelas(parcelas, { ...SEM_FILTROS, estado: "Protestada" }, estadoDe, hoje))).toEqual(["6", "7"]);
  });

  it("por tipo de título, inclusive o que não tem tipo", () => {
    expect(ids(filtrarParcelas(parcelas, { ...SEM_FILTROS, tipo: "Mensalidade" }, estadoDe, hoje))).toEqual(["1", "2", "3", "7"]);
    expect(
      ids(filtrarParcelas(parcelas, { ...SEM_FILTROS, tipo: "TAXA DE EXTENSÃO DE PRAZO 3 MESES" }, estadoDe, hoje)),
    ).toEqual(["5"]);
    expect(ids(filtrarParcelas(parcelas, { ...SEM_FILTROS, tipo: SEM_TIPO }, estadoDe, hoje))).toEqual(["6"]);
  });

  it("por situação: a automática e a escolhida à mão", () => {
    expect(ids(filtrarParcelas(parcelas, { ...SEM_FILTROS, situacao: "QUITADO" }, estadoDe, hoje))).toEqual(["1"]);
    expect(ids(filtrarParcelas(parcelas, { ...SEM_FILTROS, situacao: "PENDENTE DE PAGAMENTO" }, estadoDe, hoje))).toEqual(["2"]);
    expect(ids(filtrarParcelas(parcelas, { ...SEM_FILTROS, situacao: "Negociando" }, estadoDe, hoje))).toEqual(["6"]);
    expect(ids(filtrarParcelas(parcelas, { ...SEM_FILTROS, situacao: SEM_SITUACAO }, estadoDe, hoje))).toEqual(["7"]);
  });

  it("os três juntos restringem (E, não OU)", () => {
    const f = { estado: "Protestada", tipo: "Mensalidade", situacao: SEM_SITUACAO };
    expect(ids(filtrarParcelas(parcelas, f, estadoDe, hoje))).toEqual(["7"]);
    expect(filtrarParcelas(parcelas, { estado: "Paga", tipo: "Renegociação", situacao: "" }, estadoDe, hoje)).toEqual([]);
  });
});
