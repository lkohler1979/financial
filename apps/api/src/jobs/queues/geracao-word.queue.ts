import { Queue } from "bullmq";
import { redisConnection } from "../redis-connection";

export const GERACAO_WORD_QUEUE_NAME = "geracao-word";

export interface GeracaoWordJobData {
  relatorioId: string;
}

export const geracaoWordQueue = new Queue<GeracaoWordJobData>(GERACAO_WORD_QUEUE_NAME, {
  connection: redisConnection,
});
