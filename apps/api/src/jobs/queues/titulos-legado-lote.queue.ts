import { Queue } from "bullmq";
import { redisConnection } from "../redis-connection";

export const TITULOS_LEGADO_LOTE_QUEUE_NAME = "titulos-legado-lote";

export interface TitulosLegadoLoteJobData {
  loteId: string;
}

// Sem retry automático: se falhar, o usuário vê o motivo na tela e dispara de novo — a rotina é
// idempotente (título já importado não é duplicado).
export const titulosLegadoLoteQueue = new Queue<TitulosLegadoLoteJobData, unknown, string>(
  TITULOS_LEGADO_LOTE_QUEUE_NAME,
  {
    connection: redisConnection,
    defaultJobOptions: { attempts: 1, removeOnComplete: 20, removeOnFail: 20 },
  },
);
