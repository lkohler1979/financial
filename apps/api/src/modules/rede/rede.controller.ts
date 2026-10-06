import { Request, Response } from "express";
import { asyncHandler } from "../../shared/utils/async-handler";
import { paramString, usuarioAtual } from "../../shared/utils/http";
import { estornoCartaoSchema, redeWebhookSchema } from "./rede.schema";
import { redeService } from "./rede.service";

export const redeController = {
  /** Estorno total de um pagamento de cartão (só ADMINISTRADOR — ver rota). */
  estornar: asyncHandler(async (req: Request, res: Response) => {
    const { motivo } = estornoCartaoSchema.parse(req.body);
    res.json(await redeService.estornarCartao(paramString(req, "parcelaId"), motivo, usuarioAtual(req)));
  }),

  conferirEstorno: asyncHandler(async (req: Request, res: Response) => {
    const situacao = await redeService.conferirEstorno(paramString(req, "parcelaId"), usuarioAtual(req));
    res.json({ situacao });
  }),

  // Rota pública (sem requireAuth, ver app.ts) — autenticada pelo header
  // `authorization` (token configurado em Configurações), não por JWT.
  webhook: asyncHandler(async (req: Request, res: Response) => {
    const payload = redeWebhookSchema.parse(req.body);
    const token = req.header("authorization");
    await redeService.processarWebhook(payload, token);
    res.status(200).json({ recebido: true });
  }),
};
