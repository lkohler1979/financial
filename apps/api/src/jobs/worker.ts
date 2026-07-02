import "dotenv/config";
import { Worker } from "bullmq";

const connection = { url: process.env.REDIS_URL || "redis://localhost:6379/0" };

// TODO: registrar workers reais por fila
// - importacao.worker  → processa upload de planilha (apps/api/src/jobs/workers/importacao.worker.ts)
// - geracaoWord.worker  → gera documentos Word de protesto
// - whatsapp.worker     → envia mensagens de cobrança via Evolution API

const placeholderWorker = new Worker(
  "ethos-placeholder",
  async (job) => {
    console.log(`[worker] processando job ${job.name}`, job.data);
  },
  { connection },
);

placeholderWorker.on("completed", (job) => {
  console.log(`[worker] job ${job.id} concluído`);
});

console.log("[EthosFinancial Worker] aguardando jobs...");
