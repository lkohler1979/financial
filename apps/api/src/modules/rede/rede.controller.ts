import { Request, Response } from "express";
import { asyncHandler } from "../../shared/utils/async-handler";
import { redeWebhookSchema } from "./rede.schema";
import { redeService } from "./rede.service";

export const redeController = {
  // Rota pública (sem requireAuth, ver app.ts) — autenticada pelo header
  // `authorization` (token configurado em Configurações), não por JWT.
  webhook: asyncHandler(async (req: Request, res: Response) => {
    const payload = redeWebhookSchema.parse(req.body);
    const token = req.header("authorization");
    await redeService.processarWebhook(payload, token);
    res.status(200).json({ recebido: true });
  }),
};
