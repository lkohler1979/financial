import { Request, Response } from "express";
import { asyncHandler } from "../../shared/utils/async-handler";
import { paramString, usuarioAtual } from "../../shared/utils/http";
import { consultaNfseSchema, emitirNfseSchema } from "./nfse.schema";
import { mesAnterior, nfseService } from "./nfse.service";

export const nfseController = {
  previa: asyncHandler(async (req: Request, res: Response) => {
    const { mes } = consultaNfseSchema.parse(req.query);
    res.json(await nfseService.previa(mes));
  }),

  /** Emissão manual: não depende da janela nem do interruptor da emissão automática. */
  emitir: asyncHandler(async (req: Request, res: Response) => {
    const { mes } = emitirNfseSchema.parse(req.body ?? {});
    const resultado = await nfseService.emitirPendentes(mes ?? mesAnterior(new Date()), usuarioAtual(req));
    res.json(resultado);
  }),

  atualizarStatus: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await nfseService.atualizarStatus());
  }),

  reemitirParcela: asyncHandler(async (req: Request, res: Response) => {
    res.json(await nfseService.reemitirParcela(paramString(req, "parcelaId"), usuarioAtual(req)));
  }),
};
