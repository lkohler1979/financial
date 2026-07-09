import { Queue } from "bullmq";
import { redisConnection } from "../redis-connection";

export const IMPORTACAO_QUEUE_NAME = "importacao";

export interface ImportacaoJobData {
  caminhoArquivo: string;
  nomeOriginal: string;
  usuarioId: string;
}

export interface ImportacaoJobResultado {
  importacaoId: string;
  totalRegistros: number;
  novosAlunos: number;
  alunosAtualizados: number;
  parcelasNovas: number;
  parcelasAtualizadas: number;
  erros: Array<{ linha: number; mensagem: string }>;
}

export const importacaoQueue = new Queue<ImportacaoJobData, ImportacaoJobResultado, string>(
  IMPORTACAO_QUEUE_NAME,
  { connection: redisConnection },
);
