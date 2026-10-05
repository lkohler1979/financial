import { Request, Response } from "express";
import { asyncHandler } from "../../shared/utils/async-handler";
import { paramString, usuarioAtual } from "../../shared/utils/http";
import {
  atualizarTipoCobrancaSchema,
  criarTipoCobrancaSchema,
  listarTiposCobrancaSchema,
} from "./tipos-cobranca.schema";
import { tiposCobrancaService } from "./tipos-cobranca.service";

export const tiposCobrancaController = {
  listar: asyncHandler(async (req: Request, res: Response) => {
    const { incluirInativos } = listarTiposCobrancaSchema.parse(req.query);
    res.json(await tiposCobrancaService.listar(incluirInativos));
  }),

  criar: asyncHandler(async (req: Request, res: Response) => {
    const input = criarTipoCobrancaSchema.parse(req.body);
    res.status(201).json(await tiposCobrancaService.criar(input, usuarioAtual(req)));
  }),

  atualizar: asyncHandler(async (req: Request, res: Response) => {
    const input = atualizarTipoCobrancaSchema.parse(req.body);
    res.json(await tiposCobrancaService.atualizar(paramString(req, "id"), input, usuarioAtual(req)));
  }),
};
