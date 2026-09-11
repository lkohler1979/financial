import { Queue } from "bullmq";
import { redisConnection } from "../redis-connection";

export const SINCRONIZACAO_LEGADO_QUEUE_NAME = "sincronizacao-legado";

export interface SincronizacaoLegadoJobData {
  tipo: "MANUAL" | "AGENDADA";
  usuarioId?: string;
}

export const sincronizacaoLegadoQueue = new Queue<SincronizacaoLegadoJobData, unknown, string>(
  SINCRONIZACAO_LEGADO_QUEUE_NAME,
  {
    connection: redisConnection,
    // Retry com backoff (Q11 do grilling): sessão expirada/legado fora do ar
    // não deve desistir na primeira falha da execução em lote.
    defaultJobOptions: { attempts: 3, backoff: { type: "custom" } },
  },
);

// Nome fixo do job repetível — permite removê-lo/recriá-lo (reprogramação de
// intervalo) sem duplicar execuções agendadas concorrentes.
export const JOB_AGENDADO_ID = "sincronizacao-legado-agendada";

/**
 * (Re)programa a execução automática conforme Configuracao.legadoIntervaloHoras
 * /legadoSincronizacaoAtiva — chamado ao iniciar o worker e sempre que a
 * Configuração for salva (configuracoes.service.ts).
 */
export async function reprogramarSincronizacaoAgendada(ativa: boolean, intervaloHoras: number) {
  await sincronizacaoLegadoQueue.removeJobScheduler(JOB_AGENDADO_ID);

  if (!ativa) return;

  await sincronizacaoLegadoQueue.upsertJobScheduler(
    JOB_AGENDADO_ID,
    { every: Math.max(1, intervaloHoras) * 60 * 60 * 1000 },
    { name: "sincronizar-lote", data: { tipo: "AGENDADA" } },
  );
}
