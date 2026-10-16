import { Job, Worker } from "bullmq";
import { redisConnection } from "../redis-connection";
import {
  ImportacaoLegadoLoteJobData,
  IMPORTACAO_LEGADO_LOTE_QUEUE_NAME,
} from "../queues/importacao-legado-lote.queue";
import { importacaoLegadoLoteService } from "../../modules/importacao-legado/importacao-legado-lote.service";

async function processarJob(job: Job<ImportacaoLegadoLoteJobData>) {
  return importacaoLegadoLoteService.executar(job.data.loteId, job.data.usuarioId);
}

// concurrency: 1 — só uma varredura/importação do legado por vez (não sobrecarrega o sistema
// legado nem disputa as mesmas parcelas).
export const importacaoLegadoLoteWorker = new Worker<ImportacaoLegadoLoteJobData>(
  IMPORTACAO_LEGADO_LOTE_QUEUE_NAME,
  processarJob,
  { connection: redisConnection, concurrency: 1, lockDuration: 5 * 60_000 },
);

importacaoLegadoLoteWorker.on("completed", (job) => {
  console.log(`[worker:importacao-legado-lote] job ${job.id} concluído`);
});

importacaoLegadoLoteWorker.on("failed", (job, err) => {
  console.error(`[worker:importacao-legado-lote] job ${job?.id} falhou`, err);
});
