export interface ErroImportacao {
  linha: number;
  mensagem: string;
}

export interface Importacao {
  id: string;
  arquivo: string;
  data: string;
  totalRegistros: number;
  novosAlunos: number;
  alunosAtualizados: number;
  parcelasNovas: number;
  parcelasAtualizadas: number;
  erros?: ErroImportacao[] | null;
}

export type EstadoJobImportacao =
  "waiting" | "active" | "completed" | "failed" | "delayed" | "paused" | "unknown";

export interface ResultadoJobImportacao {
  importacaoId: string;
  totalRegistros: number;
  novosAlunos: number;
  alunosAtualizados: number;
  parcelasNovas: number;
  parcelasAtualizadas: number;
  erros: ErroImportacao[];
}

export interface StatusJobImportacao {
  jobId: string;
  estado: EstadoJobImportacao;
  progresso: number;
  resultado?: ResultadoJobImportacao;
  erro?: string;
}
