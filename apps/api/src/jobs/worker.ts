import "dotenv/config";
import "./workers/importacao.worker";
import "./workers/geracao-word.worker";
import "./workers/sincronizacao-legado.worker";
import { configuracoesRepository } from "../modules/configuracoes/configuracoes.repository";
import { reprogramarSincronizacaoAgendada } from "./queues/sincronizacao-legado.queue";

// Garante que o agendamento reflita a Configuração salva mesmo se o worker
// tiver sido reiniciado sem passar por configuracoes.service.ts (ex.: deploy).
configuracoesRepository
  .obterOuCriar()
  .then((config) =>
    reprogramarSincronizacaoAgendada(config.legadoSincronizacaoAtiva, config.legadoIntervaloHoras),
  )
  .catch((err) => console.error("[worker] falha ao programar sincronização legado", err));

console.log("[EthosFinancial Worker] aguardando jobs...");
