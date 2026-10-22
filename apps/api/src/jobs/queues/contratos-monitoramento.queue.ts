import { Queue } from "bullmq";
import { redisConnection } from "../redis-connection";

export const CONTRATOS_MONITORAMENTO_QUEUE_NAME = "contratos-monitoramento";
export const JOB_CONFERIR_CONTRATOS_ID = "conferir-contratos-assinatura";

/** De quanto em quanto tempo os contratos enviados para assinatura são conferidos. */
const INTERVALO_MS = 10 * 60_000;

export const contratosMonitoramentoQueue = new Queue(CONTRATOS_MONITORAMENTO_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: { attempts: 1, removeOnComplete: 20, removeOnFail: 20 },
});

/**
 * Agenda a conferência periódica dos contratos aguardando assinatura. Complementa o webhook (que
 * pode não chegar: URL ou segredo errados, servidor fora do ar): o próprio sistema vai perguntar
 * à plataforma. Idempotente: o agendador é recriado com o mesmo id a cada partida do worker.
 */
export async function programarMonitoramentoContratos() {
  await contratosMonitoramentoQueue.upsertJobScheduler(
    JOB_CONFERIR_CONTRATOS_ID,
    { every: INTERVALO_MS },
    { name: "conferir-contratos", data: {} },
  );
}
