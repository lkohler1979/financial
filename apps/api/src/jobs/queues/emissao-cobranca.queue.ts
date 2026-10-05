import { Queue } from "bullmq";
import { redisConnection } from "../redis-connection";

export const EMISSAO_COBRANCA_QUEUE_NAME = "emissao-cobranca";
export const JOB_EMISSAO_DIARIA_ID = "emissao-cobranca-diaria";

export const emissaoCobrancaQueue = new Queue(EMISSAO_COBRANCA_QUEUE_NAME, {
  connection: redisConnection,
});

/** Agenda a emissão antecipada para todo dia às 06:00 (horário de Brasília).
 * Idempotente: o scheduler é recriado com o mesmo id a cada partida do worker. */
export async function programarEmissaoDiaria() {
  await emissaoCobrancaQueue.upsertJobScheduler(
    JOB_EMISSAO_DIARIA_ID,
    { pattern: "0 6 * * *", tz: "America/Sao_Paulo" },
    { name: "emitir-antecipadas", data: {} },
  );
}
