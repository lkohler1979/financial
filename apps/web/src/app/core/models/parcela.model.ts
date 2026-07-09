export type StatusParcela = "EM_ABERTO" | "PAGO" | "CANCELADO" | "PROTESTADO" | "RENEGOCIADO";

export interface Parcela {
  id: string;
  matriculaId: string;
  codTitulo: string;
  parcela: string;
  vencimento: string;
  valor: number;
  tipoTitulo?: string | null;
  status: StatusParcela;
  dataPagamento?: string | null;
  valorPago?: number | null;
  observacoes?: string | null;
  /** Valor com juros/multa já calculado pelo sistema de origem da planilha
   * (coluna TITULO_VALOR_JUROS_E_MULTA) — só para referência/conferência,
   * não é usado no cálculo do sistema (Configuracao.multaPercentual/
   * jurosDiarioPercentual). */
  valorOrigemComJurosEMulta?: number | null;
}
