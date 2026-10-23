import { Job, Worker } from "bullmq";
import { redisConnection } from "../redis-connection";
import {
  TitulosLegadoLoteJobData,
  TITULOS_LEGADO_LOTE_QUEUE_NAME,
} from "../queues/titulos-legado-lote.queue";
import { titulosLegadoLoteService } from "../../modules/importacao-legado/titulos-legado-lote.service";

async function processarJob(job: Job<TitulosLegadoLoteJobData>) {
  return titulosLegadoLoteService.executar(job.data.loteId);
}

// concurrency: 1 — uma busca em lote por vez (não sobrecarrega o sistema legado).
export const titulosLegadoLoteWorker = new Worker<TitulosLegadoLoteJobData>(
  TITULOS_LEGADO_LOTE_QUEUE_NAME,
  processarJob,
  { connection: redisConnection, concurrency: 1, lockDuration: 5 * 60_000 },
);

// O deploy reinicia o worker no meio de uma busca longa: ao subir e ao receber o sinal de parada,
// o lote em andamento é marcado como interrompido (senão a tela esperaria para sempre).
titulosLegadoLoteService
  .marcarInterrompidosPorReinicio()
  .catch((erro) => console.error("[worker:titulos-legado-lote] falha ao liberar lotes", erro));

for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.once(sinal, () => {
    titulosLegadoLoteService
      .marcarInterrompidosPorReinicio()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  });
}

titulosLegadoLoteWorker.on("completed", (job) => {
  console.log(`[worker:titulos-legado-lote] job ${job.id} concluído`);
});

titulosLegadoLoteWorker.on("failed", (job, err) => {
  console.error(`[worker:titulos-legado-lote] job ${job?.id} falhou`, err);
});
