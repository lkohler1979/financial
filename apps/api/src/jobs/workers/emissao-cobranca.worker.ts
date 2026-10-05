import { Worker } from "bullmq";
import { redisConnection } from "../redis-connection";
import { EMISSAO_COBRANCA_QUEUE_NAME } from "../queues/emissao-cobranca.queue";
import { emissaoCobrancaService } from "../../modules/asaas/emissao-cobranca.service";

export const emissaoCobrancaWorker = new Worker(
  EMISSAO_COBRANCA_QUEUE_NAME,
  () => emissaoCobrancaService.executarEmissaoAntecipada(),
  { connection: redisConnection, concurrency: 1 },
);

emissaoCobrancaWorker.on("completed", (job, resultado) => {
  console.log(
    `[worker:emissao-cobranca] job ${job.id}: ${resultado?.emitidas ?? 0} emitida(s), ${resultado?.falhas?.length ?? 0} falha(s)`,
  );
  for (const falha of resultado?.falhas ?? []) {
    console.warn(`[worker:emissao-cobranca] parcela ${falha.parcelaId}: ${falha.erro}`);
  }
});

emissaoCobrancaWorker.on("failed", (job, err) => {
  console.error(`[worker:emissao-cobranca] job ${job?.id} falhou`, err);
});
