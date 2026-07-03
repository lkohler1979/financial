import "dotenv/config";
import "./workers/importacao.worker";

// TODO: registrar demais workers quando os respectivos módulos existirem
// - geracaoWord.worker  → gera documentos Word de protesto (Sprint 3)
// - whatsapp.worker     → envia mensagens de cobrança via Evolution API (Sprint 6)

console.log("[EthosFinancial Worker] aguardando jobs...");
