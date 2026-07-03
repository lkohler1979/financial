import { Request, Response } from "express";
import { asyncHandler } from "../../shared/utils/async-handler";
import { paramString, usuarioAtual } from "../../shared/utils/http";
import { AppError } from "../../shared/errors/app-error";
import { listarImportacoesSchema } from "./importacao.schema";
import { importacaoService } from "./importacao.service";

export const importacaoController = {
  upload: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new AppError("Nenhum arquivo enviado (campo 'arquivo')", 400, "ARQUIVO_OBRIGATORIO");
    }

    const resultado = await importacaoService.enfileirar(
      req.file.path,
      req.file.originalname,
      usuarioAtual(req),
    );
    res.status(202).json(resultado);
  }),

  statusJob: asyncHandler(async (req: Request, res: Response) => {
    const status = await importacaoService.statusJob(paramString(req, "jobId"));
    res.json(status);
  }),

  listar: asyncHandler(async (req: Request, res: Response) => {
    const params = listarImportacoesSchema.parse(req.query);
    const resultado = await importacaoService.listar(params);
    res.json(resultado);
  }),

  buscarPorId: asyncHandler(async (req: Request, res: Response) => {
    const importacao = await importacaoService.buscarPorId(paramString(req, "id"));
    res.json(importacao);
  }),
};
