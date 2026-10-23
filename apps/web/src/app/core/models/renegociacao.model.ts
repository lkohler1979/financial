/** Parcela vista de um lado da renegociação (a quitada ou a gerada), só para rastreabilidade. */
export interface ParcelaLigada {
  id: string;
  parcela: string;
  codTitulo: string;
  vencimento: string;
  valor: number | string;
}

/** Na parcela quitada por uma renegociação: leva às parcelas novas. */
export interface RenegociadaEm {
  id: string;
  numero: number;
  criadoEm: string;
  parcelasGeradas: ParcelaLigada[];
}

/** Na parcela gerada por uma renegociação: leva às parcelas de origem. */
export interface OrigemRenegociacao {
  id: string;
  numero: number;
  criadoEm: string;
  parcelasOriginais: ParcelaLigada[];
}

export interface RenegociarPayload {
  parcelaIds: string[];
  desconto: number;
  numeroParcelas: number;
  /** AAAA-MM-DD; as demais parcelas vencem no mesmo dia dos meses seguintes. */
  primeiroVencimento: string;
}

export interface PlanoRenegociacao {
  parcelas: {
    id: string;
    parcela: string;
    codTitulo: string;
    valor: number;
    multa: number;
    juros: number;
    total: number;
  }[];
  valorOriginal: number;
  multa: number;
  juros: number;
  totalDevido: number;
  desconto: number;
  valorNegociado: number;
  novasParcelas: { numero: number; vencimento: string; valor: number }[];
}
