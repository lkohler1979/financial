import { Worker } from "bullmq";
import { redisConnection } from "../redis-connection";
import { CONTRATOS_MONITORAMENTO_QUEUE_NAME } from "../queues/contratos-monitoramento.queue";
import { contratosService } from "../../modules/contratos/contratos.service";

// concurrency: 1 — uma conferência por vez (respeita o limite de requisições das plataformas).
export const contratosMonitoramentoWorker = new Worker(
  CONTRATOS_MONITORAMENTO_QUEUE_NAME,
  async () => contratosService.monitorarPendentes(),
  { connection: redisConnection, concurrency: 1 },
);

contratosMonitoramentoWorker.on("completed", (_job, r) => {
  // Só registra quando houve algo a conferir (a cada 10 min não polui o log).
  if (r && r.conferidos > 0) {
    console.log(
      `[worker:contratos] ${r.conferidos} conferido(s): ${r.assinados} assinado(s), ${r.recusados} recusado(s), ${r.falhas} falha(s)`,
    );
  }
});

contratosMonitoramentoWorker.on("failed", (job, err) => {
  console.error(`[worker:contratos] job ${job?.id} falhou`, err);
});
