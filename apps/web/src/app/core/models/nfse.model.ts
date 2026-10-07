export type StatusNota = "AGENDADA" | "AUTORIZADA" | "ERRO" | "CANCELADA";

export interface NfsePendente {
  parcelaId: string;
  parcela: string;
  tipoTitulo: string | null;
  dataPagamento: string;
  valor: number;
  aluno: string;
  curso: string;
  matricula: string | null;
  tomador: { origem: "SACADO" | "ALUNO"; nome: string; documento: string };
  statusNota: StatusNota | null;
  erro: string | null;
  erros: string[];
  avisos: string[];
}

export interface NfseEmitida {
  parcelaId: string;
  aluno: string;
  tomador: string;
  valor: number;
  status: StatusNota;
  numero: string | null;
  pdfUrl: string | null;
  viaSefin: boolean;
  erro: string | null;
}

export interface NfsePrevia {
  /** Último dia do mês de referência (YYYY-MM-DD). */
  competencia: string;
  ativa: boolean;
  diaLimite: number;
  janelaAberta: boolean;
  pendentes: NfsePendente[];
  totalPendente: number;
  emitidas: NfseEmitida[];
}

/** Pagamento realizado que pode receber uma nota individual. */
export interface NfsePagamento {
  parcelaId: string;
  parcela: string;
  tipoTitulo: string | null;
  /** A rotina automática só emite Mensalidade/Renegociação; os demais tipos só saem aqui, à mão. */
  geraNotaAutomatica: boolean;
  dataPagamento: string;
  valor: number;
  aluno: string;
  curso: string;
  matricula: string | null;
  tomador: { origem: "SACADO" | "ALUNO"; nome: string; documento: string };
  /** Último dia do mês do pagamento (limitado a hoje), YYYY-MM-DD. */
  competenciaPadrao: string | null;
  statusNota: StatusNota | null;
  numeroNota: string | null;
  erro: string | null;
  pdfUrl: string | null;
  /** Emitida direto na SEFIN: o PDF (DANFSe) é baixado pela API. */
  viaSefin: boolean;
  erros: string[];
  avisos: string[];
}

export interface NfseSituacaoNacional {
  pronto: boolean;
  pendencias: string[];
}

export interface NfseResultadoEmissao {
  emitidas: number;
  agendadas: number;
  erros: { parcelaId: string; erro: string }[];
  restantes: number;
}
