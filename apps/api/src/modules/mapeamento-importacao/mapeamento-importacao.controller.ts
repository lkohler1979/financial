import { Request, Response } from "express";
import { asyncHandler } from "../../shared/utils/async-handler";
import { paramString, usuarioAtual } from "../../shared/utils/http";
import {
  atualizarMapeamentoSchema,
  criarMapeamentoSchema,
} from "./mapeamento-importacao.schema";
import { mapeamentoImportacaoService } from "./mapeamento-importacao.service";

export const mapeamentoImportacaoController = {
  camposDisponiveis: asyncHandler(async (_req: Request, res: Response) => {
    res.json(mapeamentoImportacaoService.camposDisponiveis());
  }),

  listar: asyncHandler(async (_req: Request, res: Response) => {
    const mapeamentos = await mapeamentoImportacaoService.listar();
    res.json(mapeamentos);
  }),

  criar: asyncHandler(async (req: Request, res: Response) => {
    const input = criarMapeamentoSchema.parse(req.body);
    const mapeamento = await mapeamentoImportacaoService.criar(input, usuarioAtual(req));
    res.status(201).json(mapeamento);
  }),

  atualizar: asyncHandler(async (req: Request, res: Response) => {
    const input = atualizarMapeamentoSchema.parse(req.body);
    const mapeamento = await mapeamentoImportacaoService.atualizar(
      paramString(req, "id"),
      input,
      usuarioAtual(req),
    );
    res.json(mapeamento);
  }),

  remover: asyncHandler(async (req: Request, res: Response) => {
    await mapeamentoImportacaoService.remover(paramString(req, "id"), usuarioAtual(req));
    res.status(204).send();
  }),
};
