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
}

export type TipoCobrancaPayload = Partial<Omit<TipoCobranca, "id">>;

/** Cobrança escolhida no cadastro da matrícula. */
export interface CobrancaMatriculaPayload {
  tipoCobrancaId: string;
  valor?: number;
  numeroParcelas: number;
  primeiroVencimento: string;
}
