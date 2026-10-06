export type StatusParcela =
  | "EM_ABERTO"
  | "PAGO"
  | "CANCELADO"
  | "PROTESTO_ENVIADO"
  | "PROTESTADO"
  | "RENEGOCIADO";

export type StatusSincronizacaoLegado = "PENDENTE" | "SINCRONIZADO";

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
  /** Ver StatusSincronizacaoLegado — marcado SINCRONIZADO quando esta
   * Parcela já foi conferida com sucesso contra o sistema legado. */
  statusSincronizacaoLegado?: StatusSincronizacaoLegado;
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
  /** Multa/juros/total calculados pelo próprio sistema legado — presentes só
   * em Parcelas importadas/sincronizadas do legado. Quando presentes, a
   * Ficha de Cobrança nunca recalcula, sempre exibe estes valores (decisão
   * do usuário, 2026-09-15: o legado é sempre a fonte de verdade para
   * multa/juros de Parcela vinda de lá). */
  multaLegado?: number | null;
  jurosLegado?: number | null;
  totalLegado?: number | null;
  /** Código `tipotituloId` do legado (33 = Renegociação, 2 = Mensalidade) —
   * confirmado ao vivo em 2026-09-17 contra `titulo-informacoes/{id}`.
   * Presente só em Parcelas importadas/sincronizadas do legado; usado só
   * para exibição/conferência — `tipoTitulo` (acima) é o campo normalizado
   * usado no filtro de geração de protesto. */
  tipoTituloIdLegado?: number | null;
  /** `tituloObservacoes` do legado (texto livre do sistema de origem) —
   * nunca confundir com `observacoes` (gestão interna do Ethos). */
  tituloObservacoesLegado?: string | null;
  /** Campos da integração com o Asaas (Boleto/Pix/Cartão) — presentes só
   * depois de "Gerar cobrança" ser clicado para esta parcela. Só
   * leitura/exibição. */
  asaasPaymentId?: string | null;
  asaasBillingType?: "BOLETO" | "PIX" | "CREDIT_CARD" | null;
  /** Pagamento no cartão pela Rede — só bandeira e final (o número nunca é guardado). */
  cartaoBandeira?: string | null;
  cartaoFinal?: string | null;
  cartaoParcelas?: number | null;
  /** Preenchido enquanto a Rede ainda processa um estorno pedido (D+1). */
  cartaoEstornoId?: string | null;
  /** Forma de pagamento escolhida para este título no cadastro. */
  formaPagamento?: "BOLETO" | "PIX" | "CREDIT_CARD" | null;
  /** Qual provedor processou esta cobrança — Asaas ou Rede (Pix). */
  provedorPagamento?: "ASAAS" | "REDE" | null;
  asaasBoletoUrl?: string | null;
  asaasLinhaDigitavel?: string | null;
  /** Fatura hospedada pelo Asaas — usada principalmente pra cartão (o
   * cliente insere os dados lá, o Ethos nunca coleta número/CVV). */
  asaasInvoiceUrl?: string | null;
  asaasPixQrCodeImagem?: string | null;
  asaasPixCopiaECola?: string | null;
  asaasStatus?: string | null;
}
