/**
 * Regras da Ficha de Cobrança que não dependem de tela: a Situação automática de cada parcela e o
 * totalizador. Sem Angular, para poder ser testada (apps/api/tests/unit/ficha-totais.test.ts).
 */

export type StatusDaParcela =
  "EM_ABERTO" | "PAGO" | "CANCELADO" | "PROTESTO_ENVIADO" | "PROTESTADO" | "RENEGOCIADO";

export interface ParcelaParaTotais {
  status: StatusDaParcela;
  valor: number | string;
  vencimento: string;
  descontoLegado?: number | string | null;
}

export interface EncargosDaParcela {
  multa: number;
  juros: number;
}

export interface TotaisDaFicha {
  totalJuros: number;
  totalMultas: number;
  totalDescontos: number;
  qtdVencidos: number;
  /** Valor original (sem multa e juros) das parcelas vencidas. */
  totalVencidos: number;
  /** Pagas e renegociadas. */
  qtdPagos: number;
  /** Valor das parcelas devedoras, menos os descontos. */
  totalFinalSemEncargos: number;
  /** Total final sem encargos + multas + juros. */
  totalFinalComEncargos: number;
}

export const SITUACAO_QUITADO = "QUITADO";
export const SITUACAO_QUITADO_RENEGOCIACAO = "QUITADO POR RENEGOCIAÇÃO";
export const SITUACAO_PENDENTE = "PENDENTE DE PAGAMENTO";
export const SITUACAO_ABERTO = "ABERTO";

const centavos = (v: number): number => Math.round(v * 100) / 100;

/** AAAA-MM-DD do dia de hoje no fuso local (o vencimento é uma data, sem hora). */
function diaDe(hoje: Date): string {
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const dia = String(hoje.getDate()).padStart(2, "0");
  return `${hoje.getFullYear()}-${mes}-${dia}`;
}

export function estaVencida(parcela: Pick<ParcelaParaTotais, "vencimento">, hoje: Date): boolean {
  return parcela.vencimento.slice(0, 10) < diaDe(hoje);
}

/** Parcelas que ainda estão devendo. */
export function ehDevedora(parcela: Pick<ParcelaParaTotais, "status">): boolean {
  return (
    parcela.status === "EM_ABERTO" ||
    parcela.status === "PROTESTO_ENVIADO" ||
    parcela.status === "PROTESTADO"
  );
}

/**
 * Situação definida pelo estado da parcela: paga → QUITADO; renegociada → QUITADO POR
 * RENEGOCIAÇÃO; em aberto e vencida → PENDENTE DE PAGAMENTO; em aberto a vencer → ABERTO.
 * Cancelada e protestos não têm situação automática (ficam com a escolha manual).
 */
export function situacaoAutomatica(
  parcela: Pick<ParcelaParaTotais, "status" | "vencimento">,
  hoje: Date,
): string | null {
  switch (parcela.status) {
    case "PAGO":
      return SITUACAO_QUITADO;
    case "RENEGOCIADO":
      return SITUACAO_QUITADO_RENEGOCIACAO;
    case "EM_ABERTO":
      return estaVencida(parcela, hoje) ? SITUACAO_PENDENTE : SITUACAO_ABERTO;
    default:
      return null;
  }
}

export function totaisDaFicha(
  parcelas: ParcelaParaTotais[],
  encargos: (parcela: ParcelaParaTotais) => EncargosDaParcela,
  hoje: Date,
): TotaisDaFicha {
  const devedoras = parcelas.filter(ehDevedora);
  const vencidas = devedoras.filter((p) => estaVencida(p, hoje));
  const soma = (lista: ParcelaParaTotais[], f: (p: ParcelaParaTotais) => number) =>
    centavos(lista.reduce((total, p) => total + f(p), 0));

  const totalMultas = soma(devedoras, (p) => encargos(p).multa);
  const totalJuros = soma(devedoras, (p) => encargos(p).juros);
  const totalDescontos = soma(devedoras, (p) => Number(p.descontoLegado ?? 0));
  const totalFinalSemEncargos = centavos(soma(devedoras, (p) => Number(p.valor)) - totalDescontos);

  return {
    totalJuros,
    totalMultas,
    totalDescontos,
    qtdVencidos: vencidas.length,
    totalVencidos: soma(vencidas, (p) => Number(p.valor)),
    qtdPagos: parcelas.filter((p) => p.status === "PAGO" || p.status === "RENEGOCIADO").length,
    totalFinalSemEncargos,
    totalFinalComEncargos: centavos(totalFinalSemEncargos + totalMultas + totalJuros),
  };
}
