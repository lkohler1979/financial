import { Request, Response } from "express";
import { asyncHandler } from "../../shared/utils/async-handler";
import { usuarioAtual } from "../../shared/utils/http";
import {
  atualizarConfiguracaoSchema,
  limparAlunosSchema,
  limparBaseSchema,
} from "./configuracoes.schema";
import { configuracoesService } from "./configuracoes.service";

export const configuracoesController = {
  obter: asyncHandler(async (_req: Request, res: Response) => {
    const configuracao = await configuracoesService.obter();
    res.json(configuracao);
  }),

  atualizar: asyncHandler(async (req: Request, res: Response) => {
    const input = atualizarConfiguracaoSchema.parse(req.body);
    const configuracao = await configuracoesService.atualizar(input, usuarioAtual(req));
    res.json(configuracao);
  }),

  limparAlunos: asyncHandler(async (req: Request, res: Response) => {
    limparAlunosSchema.parse(req.body);
    const contagens = await configuracoesService.limparAlunos(usuarioAtual(req));
    res.json({ contagens });
  }),

  limparBase: asyncHandler(async (req: Request, res: Response) => {
    limparBaseSchema.parse(req.body);
    const contagens = await configuracoesService.limparBase(usuarioAtual(req));
    res.json({ contagens });
  }),
};
