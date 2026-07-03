import "dotenv/config";
import "./workers/importacao.worker";
import "./workers/geracao-word.worker";

// TODO: registrar demais workers quando os respectivos módulos existirem
// - whatsapp.worker → envia mensagens de cobrança via Evolution API (Sprint 6)

console.log("[EthosFinancial Worker] aguardando jobs...");
