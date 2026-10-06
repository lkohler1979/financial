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

export interface NfseResultadoEmissao {
  emitidas: number;
  agendadas: number;
  erros: { parcelaId: string; erro: string }[];
  restantes: number;
}
