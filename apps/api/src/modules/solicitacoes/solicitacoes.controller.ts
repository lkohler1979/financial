import { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../../shared/utils/async-handler";
import { paramString, usuarioAtual } from "../../shared/utils/http";
import {
  atenderSolicitacaoSchema,
  atualizarTipoSolicitacaoSchema,
  criarTipoSolicitacaoSchema,
  recusarSolicitacaoSchema,
} from "./solicitacoes.schema";
import { solicitacoesService } from "./solicitacoes.service";

const statusSchema = z.enum(["ABERTA", "ATENDIDA", "RECUSADA"]).optional();

export const solicitacoesController = {
  listarTipos: asyncHandler(async (req: Request, res: Response) => {
    res.json(await solicitacoesService.listarTipos(req.query.incluirInativos === "true"));
  }),

  criarTipo: asyncHandler(async (req: Request, res: Response) => {
    const input = criarTipoSolicitacaoSchema.parse(req.body);
    res.status(201).json(await solicitacoesService.criarTipo(input, usuarioAtual(req)));
  }),

  atualizarTipo: asyncHandler(async (req: Request, res: Response) => {
    const input = atualizarTipoSolicitacaoSchema.parse(req.body);
    res.json(
      await solicitacoesService.atualizarTipo(paramString(req, "id"), input, usuarioAtual(req)),
    );
  }),

  listar: asyncHandler(async (req: Request, res: Response) => {
    const status = statusSchema.parse(req.query.status || undefined);
    res.json(await solicitacoesService.listar(status));
  }),

  atender: asyncHandler(async (req: Request, res: Response) => {
    const { resposta } = atenderSolicitacaoSchema.parse(req.body ?? {});
    res.json(
      await solicitacoesService.atender(paramString(req, "id"), req.file, resposta, usuarioAtual(req)),
    );
  }),

  recusar: asyncHandler(async (req: Request, res: Response) => {
    const { motivo } = recusarSolicitacaoSchema.parse(req.body);
    res.json(await solicitacoesService.recusar(paramString(req, "id"), motivo, usuarioAtual(req)));
  }),

  baixarArquivo: asyncHandler(async (req: Request, res: Response) => {
    const arquivo = await solicitacoesService.obterArquivo(paramString(req, "id"));
    res.type(arquivo.mime);
    res.download(arquivo.caminho, arquivo.nome);
  }),
};
