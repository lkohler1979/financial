import { Queue } from "bullmq";
import { redisConnection } from "../redis-connection";

export const DOCUMENTOS_LEGADO_LOTE_QUEUE_NAME = "documentos-legado-lote";

export interface DocumentosLegadoLoteJobData {
  loteId: string;
}

// Sem retry automático: se falhar, o usuário vê o motivo na tela e dispara de novo — a rotina é
// idempotente (arquivo já importado não é baixado outra vez).
export const documentosLegadoLoteQueue = new Queue<DocumentosLegadoLoteJobData, unknown, string>(
  DOCUMENTOS_LEGADO_LOTE_QUEUE_NAME,
  {
    connection: redisConnection,
    defaultJobOptions: { attempts: 1, removeOnComplete: 20, removeOnFail: 20 },
  },
);
