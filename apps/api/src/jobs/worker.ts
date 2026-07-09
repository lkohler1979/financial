import "dotenv/config";
import "./workers/importacao.worker";
import "./workers/geracao-word.worker";

console.log("[EthosFinancial Worker] aguardando jobs...");
