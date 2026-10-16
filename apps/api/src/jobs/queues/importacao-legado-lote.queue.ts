import { Queue } from "bullmq";
import { redisConnection } from "../redis-connection";

export const IMPORTACAO_LEGADO_LOTE_QUEUE_NAME = "importacao-legado-lote";

export interface ImportacaoLegadoLoteJobData {
  loteId: string;
  usuarioId: string;
}

// Sem retry automático: a execução é longa e idempotente só até certo ponto — se falhar, o
// usuário vê o motivo na tela e dispara de novo (as parcelas já gravadas são só atualizadas).
export const importacaoLegadoLoteQueue = new Queue<ImportacaoLegadoLoteJobData, unknown, string>(
  IMPORTACAO_LEGADO_LOTE_QUEUE_NAME,
  {
    connection: redisConnection,
    defaultJobOptions: { attempts: 1, removeOnComplete: 20, removeOnFail: 20 },
  },
);
