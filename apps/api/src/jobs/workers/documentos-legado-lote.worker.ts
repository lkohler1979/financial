import { Job, Worker } from "bullmq";
import { redisConnection } from "../redis-connection";
import {
  DocumentosLegadoLoteJobData,
  DOCUMENTOS_LEGADO_LOTE_QUEUE_NAME,
} from "../queues/documentos-legado-lote.queue";
import { documentosLegadoLoteService } from "../../modules/importacao-legado/documentos-legado-lote.service";

async function processarJob(job: Job<DocumentosLegadoLoteJobData>) {
  return documentosLegadoLoteService.executar(job.data.loteId);
}

// concurrency: 1 — uma busca em lote por vez (não sobrecarrega o sistema legado).
export const documentosLegadoLoteWorker = new Worker<DocumentosLegadoLoteJobData>(
  DOCUMENTOS_LEGADO_LOTE_QUEUE_NAME,
  processarJob,
  { connection: redisConnection, concurrency: 1, lockDuration: 5 * 60_000 },
);

// O deploy reinicia o worker no meio de uma busca longa: ao subir e ao receber o sinal de parada,
// o lote em andamento é marcado como interrompido (senão a tela esperaria para sempre).
documentosLegadoLoteService
  .marcarInterrompidosPorReinicio()
  .catch((erro) => console.error("[worker:documentos-legado-lote] falha ao liberar lotes", erro));

for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.once(sinal, () => {
    documentosLegadoLoteService
      .marcarInterrompidosPorReinicio()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  });
}

documentosLegadoLoteWorker.on("completed", (job) => {
  console.log(`[worker:documentos-legado-lote] job ${job.id} concluído`);
});

documentosLegadoLoteWorker.on("failed", (job, err) => {
  console.error(`[worker:documentos-legado-lote] job ${job?.id} falhou`, err);
});
