import { Request, Response } from "express";
import { asyncHandler } from "../../shared/utils/async-handler";
import { paramString } from "../../shared/utils/http";
import {
  atualizarSituacaoSchema,
  criarSituacaoSchema,
  listarSituacoesSchema,
} from "./situacoes.schema";
import { situacoesService } from "./situacoes.service";

export const situacoesController = {
  listar: asyncHandler(async (req: Request, res: Response) => {
    const params = listarSituacoesSchema.parse(req.query);
    const situacoes = await situacoesService.listar(params);
    res.json(situacoes);
  }),

  buscarPorId: asyncHandler(async (req: Request, res: Response) => {
    const situacao = await situacoesService.buscarPorId(paramString(req, "id"));
    res.json(situacao);
  }),

  criar: asyncHandler(async (req: Request, res: Response) => {
    const input = criarSituacaoSchema.parse(req.body);
    const situacao = await situacoesService.criar(input);
    res.status(201).json(situacao);
  }),

  atualizar: asyncHandler(async (req: Request, res: Response) => {
    const input = atualizarSituacaoSchema.parse(req.body);
    const situacao = await situacoesService.atualizar(paramString(req, "id"), input);
    res.json(situacao);
  }),

  remover: asyncHandler(async (req: Request, res: Response) => {
    await situacoesService.remover(paramString(req, "id"));
    res.status(204).send();
  }),
};
