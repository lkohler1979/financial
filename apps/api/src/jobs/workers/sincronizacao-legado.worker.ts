import { Job, Worker } from "bullmq";
import { redisConnection } from "../redis-connection";
import {
  SincronizacaoLegadoJobData,
  SINCRONIZACAO_LEGADO_QUEUE_NAME,
} from "../queues/sincronizacao-legado.queue";
import { sincronizacaoLegadoService } from "../../modules/sincronizacao-legado/sincronizacao-legado.service";

async function processarJob(job: Job<SincronizacaoLegadoJobData>) {
  const { tipo, usuarioId } = job.data;
  return sincronizacaoLegadoService.executarLote(tipo, usuarioId);
}

// concurrency: 1 — só uma execução em lote por vez (Q13 do grilling), evita
// sobrecarregar o sistema legado e condição de corrida ao atualizar a mesma
// Parcela. O botão manual de 1 matrícula (sincronizacao-legado.controller.ts)
// não passa por esta fila, então continua funcionando em paralelo.
export const sincronizacaoLegadoWorker = new Worker<SincronizacaoLegadoJobData>(
  SINCRONIZACAO_LEGADO_QUEUE_NAME,
  processarJob,
  {
    connection: redisConnection,
    concurrency: 1,
    // Retry com backoff (Q11): sessão expirada/legado fora do ar não deve
    // desistir na primeira falha.
    settings: { backoffStrategy: (attempts) => Math.min(attempts * 30_000, 5 * 60_000) },
  },
);

sincronizacaoLegadoWorker.on("completed", (job) => {
  console.log(`[worker:sincronizacao-legado] job ${job.id} concluído`);
});

sincronizacaoLegadoWorker.on("failed", (job, err) => {
  console.error(`[worker:sincronizacao-legado] job ${job?.id} falhou`, err);
});
