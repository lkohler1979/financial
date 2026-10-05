import { Request, Response } from "express";
import { asyncHandler } from "../../shared/utils/async-handler";
import { paramString, usuarioAtual } from "../../shared/utils/http";
import { atualizarCupomSchema, criarCupomSchema, validarCupomSchema } from "./cupons.schema";
import { cuponsService } from "./cupons.service";

export const cuponsController = {
  listar: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await cuponsService.listar());
  }),

  validar: asyncHandler(async (req: Request, res: Response) => {
    const { codigo } = validarCupomSchema.parse(req.query);
    res.json(await cuponsService.validar(codigo));
  }),

  criar: asyncHandler(async (req: Request, res: Response) => {
    const input = criarCupomSchema.parse(req.body);
    res.status(201).json(await cuponsService.criar(input, usuarioAtual(req)));
  }),

  atualizar: asyncHandler(async (req: Request, res: Response) => {
    const input = atualizarCupomSchema.parse(req.body);
    res.json(await cuponsService.atualizar(paramString(req, "id"), input, usuarioAtual(req)));
  }),
};
