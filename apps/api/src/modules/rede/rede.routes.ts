import { Router } from "express";
import { redeController } from "./rede.controller";

// Rota pública do webhook — precisa ficar fora do requireAuth global (ver
// app.ts), já que quem chama é a Rede, não um usuário logado. Não existe
// "gerar cobrança" dedicado aqui — isso continua em POST
// /api/asaas/parcelas/:id/cobranca, que despacha pro provedor configurado.
export const redeWebhookRouter = Router();
redeWebhookRouter.post("/", redeController.webhook);

// Rotas internas (exigem login): estorno de cartão é financeiro sensível — só administrador.
export const redeRouter = Router();
redeRouter.post("/parcelas/:parcelaId/estorno", redeController.estornar);
redeRouter.post("/parcelas/:parcelaId/estorno/conferir", redeController.conferirEstorno);
