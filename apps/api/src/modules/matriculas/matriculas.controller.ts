import { Request, Response } from "express";
import { asyncHandler } from "../../shared/utils/async-handler";
import { paramString, usuarioAtual } from "../../shared/utils/http";
import {
  alterarSituacaoSchema,
  atualizarMatriculaSchema,
  criarMatriculaSchema,
  listarMatriculasSchema,
} from "./matriculas.schema";
import { matriculasService } from "./matriculas.service";
import { situacaoService } from "./situacao.service";

export const matriculasController = {
  listar: asyncHandler(async (req: Request, res: Response) => {
    const params = listarMatriculasSchema.parse(req.query);
    const resultado = await matriculasService.listar(params);
    res.json(resultado);
  }),

  listarAgentes: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await matriculasService.listarAgentes());
  }),

  listarSituacoes: asyncHandler(async (_req: Request, res: Response) => {
    res.json(situacaoService.listarSituacoes());
  }),

  historicoSituacao: asyncHandler(async (req: Request, res: Response) => {
    res.json(await situacaoService.listarHistorico(paramString(req, "id")));
  }),

  alterarSituacao: asyncHandler(async (req: Request, res: Response) => {
    const input = alterarSituacaoSchema.parse(req.body);
    res.json(await situacaoService.alterar(paramString(req, "id"), input, usuarioAtual(req)));
  }),

  buscarPorId: asyncHandler(async (req: Request, res: Response) => {
    const matricula = await matriculasService.buscarPorId(paramString(req, "id"));
    res.json(matricula);
  }),

  criar: asyncHandler(async (req: Request, res: Response) => {
    const input = criarMatriculaSchema.parse(req.body);
    const matricula = await matriculasService.criar(input, usuarioAtual(req));
    res.status(201).json(matricula);
  }),

  atualizar: asyncHandler(async (req: Request, res: Response) => {
    const input = atualizarMatriculaSchema.parse(req.body);
    const matricula = await matriculasService.atualizar(
      paramString(req, "id"),
      input,
      usuarioAtual(req),
    );
    res.json(matricula);
  }),

  remover: asyncHandler(async (req: Request, res: Response) => {
    await matriculasService.remover(paramString(req, "id"), usuarioAtual(req));
    res.status(204).send();
  }),

  gerarParcelas: asyncHandler(async (req: Request, res: Response) => {
    const resultado = await matriculasService.gerarParcelas(
      paramString(req, "id"),
      usuarioAtual(req),
    );
    res.json(resultado);
  }),
};
