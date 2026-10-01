import { Request, Response } from "express";
import { asyncHandler } from "../../shared/utils/async-handler";
import { paramString, usuarioAtual } from "../../shared/utils/http";
import { asaasWebhookSchema, gerarCobrancaSchema } from "./asaas.schema";
import { asaasService } from "./asaas.service";

export const asaasController = {
  gerarCobranca: asyncHandler(async (req: Request, res: Response) => {
    const { billingType } = gerarCobrancaSchema.parse(req.body);
    const resultado = await asaasService.gerarCobrancaParcela(
      paramString(req, "parcelaId"),
      billingType,
      usuarioAtual(req),
    );
    res.json(resultado);
  }),

  // Rota pública (sem requireAuth, ver app.ts) — autenticada pelo header
  // `asaas-access-token` configurado no painel de Webhooks do Asaas, não por
  // JWT. Sempre responde 200 (mesmo pra evento desconhecido/ignorado), pra
  // não entrar em loop de retentativa do lado do Asaas.
  webhook: asyncHandler(async (req: Request, res: Response) => {
    const payload = asaasWebhookSchema.parse(req.body);
    const token = req.header("asaas-access-token");
    await asaasService.processarWebhook(payload, token);
    res.status(200).json({ recebido: true });
  }),
};
