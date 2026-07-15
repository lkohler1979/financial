export type StatusParcela =
  | "EM_ABERTO"
  | "PAGO"
  | "CANCELADO"
  | "PROTESTO_ENVIADO"
  | "PROTESTADO"
  | "RENEGOCIADO";

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
  /** Multa/juros/total congelados no momento em que o documento de protesto
   * foi gerado para esta parcela — presentes só depois de PROTESTO_ENVIADO. Usados
   * em vez de recalcular com a data de hoje, para a Ficha de Cobrança nunca
   * divergir do documento já gerado (decisão do usuário, 2026-07-09). */
  multaProtesto?: number | null;
  jurosProtesto?: number | null;
  totalProtesto?: number | null;
}
