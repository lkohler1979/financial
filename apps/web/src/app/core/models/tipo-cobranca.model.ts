export type FormaPagamento = "BOLETO" | "PIX" | "CREDIT_CARD";

export const ROTULO_FORMA_PAGAMENTO: Record<FormaPagamento, string> = {
  BOLETO: "Boleto",
  PIX: "Pix",
  CREDIT_CARD: "Cartão de crédito",
};

export interface TipoCobranca {
  id: string;
  nome: string;
  /** Obrigatório = sempre gerado no cadastro da matrícula. */
  obrigatorio: boolean;
  /** true = o valor vem do valor padrão do curso (ex.: Mensalidade). */
  usaValorDoCurso: boolean;
  valorPadrao: number | null;
  /** Opções de parcelamento oferecidas (ex.: 1, 6, 9, 12). */
  opcoesParcelas: number[];
  /** Prefixo do código do título das parcelas (ex.: "TM"); vazio = só número. */
  prefixoTitulo: string | null;
  ordem: number;
  ativo: boolean;
  /** Forma de pagamento sugerida no cadastro (editável por título). */
  formaPagamentoPadrao: FormaPagamento | null;
  /** O cupom de desconto só incide nos tipos que aceitam. */
  aceitaCupom: boolean;
  /** false = nunca entra no protesto (ex.: Taxa de matrícula). */
  entraNoProtesto: boolean;
  /** false = não aparece no cadastro da matrícula (ex.: Renegociação). */
  disponivelNoCadastro: boolean;
}

export type TipoCobrancaPayload = Partial<Omit<TipoCobranca, "id">>;

/** Cobrança escolhida no cadastro da matrícula. */
export interface CobrancaMatriculaPayload {
  tipoCobrancaId: string;
  valor?: number;
  numeroParcelas: number;
  primeiroVencimento: string;
  formaPagamento?: FormaPagamento;
}
