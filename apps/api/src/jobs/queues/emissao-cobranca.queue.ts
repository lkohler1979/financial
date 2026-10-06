import { Queue } from "bullmq";
import { redisConnection } from "../redis-connection";

export const EMISSAO_COBRANCA_QUEUE_NAME = "emissao-cobranca";
export const JOB_EMISSAO_DIARIA_ID = "emissao-cobranca-diaria";

export const emissaoCobrancaQueue = new Queue(EMISSAO_COBRANCA_QUEUE_NAME, {
  connection: redisConnection,
});

export const JOB_CONFERIR_ESTORNOS_ID = "conferir-estornos-diario";

/** Agenda a emissão antecipada (06:00) e a conferência de estornos (07:00), horário de Brasília.
 * Idempotente: os schedulers são recriados com o mesmo id a cada partida do worker. */
export async function programarEmissaoDiaria() {
  // Estornos de cartão que a Rede ainda processava (D+1): conferidos todo dia às 07:00.
  await emissaoCobrancaQueue.upsertJobScheduler(
    JOB_CONFERIR_ESTORNOS_ID,
    { pattern: "0 7 * * *", tz: "America/Sao_Paulo" },
    { name: "conferir-estornos", data: {} },
  );
  await emissaoCobrancaQueue.upsertJobScheduler(
    JOB_EMISSAO_DIARIA_ID,
    { pattern: "0 6 * * *", tz: "America/Sao_Paulo" },
    { name: "emitir-antecipadas", data: {} },
  );
}
