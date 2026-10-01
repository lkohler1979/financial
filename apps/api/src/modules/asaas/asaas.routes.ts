import { Router } from "express";
import { asaasController } from "./asaas.controller";

// Rotas autenticadas (gerar boleto) — montadas em app.ts com RBAC
// (ADMINISTRADOR/FINANCEIRO), igual ao resto do módulo financeiro.
export const asaasRouter = Router();
asaasRouter.post("/parcelas/:parcelaId/cobranca", asaasController.gerarCobranca);

// Rota pública do webhook — precisa ficar fora do requireAuth global (ver
// app.ts), já que quem chama é o Asaas, não um usuário logado.
export const asaasWebhookRouter = Router();
asaasWebhookRouter.post("/", asaasController.webhook);
