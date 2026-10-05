// Ver server.ts — mesmo motivo: sistema é só para o Brasil, e o processo
// precisa gerar/interpretar vencimentos no fuso America/Sao_Paulo, não UTC.
process.env.TZ ||= "America/Sao_Paulo";

import "dotenv/config";
import "./workers/importacao.worker";
import "./workers/geracao-word.worker";
import "./workers/sincronizacao-legado.worker";
import "./workers/emissao-cobranca.worker";
import { configuracoesRepository } from "../modules/configuracoes/configuracoes.repository";
import { reprogramarSincronizacaoAgendada } from "./queues/sincronizacao-legado.queue";
import { programarEmissaoDiaria } from "./queues/emissao-cobranca.queue";

// Garante que o agendamento reflita a Configuração salva mesmo se o worker
// tiver sido reiniciado sem passar por configuracoes.service.ts (ex.: deploy).
configuracoesRepository
  .obterOuCriar()
  .then((config) =>
    reprogramarSincronizacaoAgendada(config.legadoSincronizacaoAtiva, config.legadoIntervaloHoras),
  )
  .catch((err) => console.error("[worker] falha ao programar sincronização legado", err));

programarEmissaoDiaria().catch((err) =>
  console.error("[worker] falha ao programar emissão diária de cobranças", err),
);

console.log("[EthosFinancial Worker] aguardando jobs...");
