import { Request, Response } from "express";
import { asyncHandler } from "../../shared/utils/async-handler";
import { paramString, usuarioAtual } from "../../shared/utils/http";
import {
  atualizarSacadoSchema,
  listarSacadosSchema,
  paginarSacadosSchema,
  sacadoDadosSchema,
} from "./sacados.schema";
import { sacadosService } from "./sacados.service";

export const sacadosController = {
  buscar: asyncHandler(async (req: Request, res: Response) => {
    const { busca } = listarSacadosSchema.parse(req.query);
    res.json(await sacadosService.buscar(busca));
  }),

  listar: asyncHandler(async (req: Request, res: Response) => {
    const { busca, page, pageSize } = paginarSacadosSchema.parse(req.query);
    res.json(await sacadosService.listar(busca, page, pageSize));
  }),

  ficha: asyncHandler(async (req: Request, res: Response) => {
    res.json(await sacadosService.ficha(paramString(req, "id")));
  }),

  remover: asyncHandler(async (req: Request, res: Response) => {
    await sacadosService.remover(paramString(req, "id"), usuarioAtual(req));
    res.status(204).send();
  }),

  buscarPorId: asyncHandler(async (req: Request, res: Response) => {
    res.json(await sacadosService.buscarPorId(paramString(req, "id")));
  }),

  criar: asyncHandler(async (req: Request, res: Response) => {
    const dados = sacadoDadosSchema.parse(req.body);
    res.status(201).json(await sacadosService.obterOuCriar(dados, usuarioAtual(req)));
  }),

  atualizar: asyncHandler(async (req: Request, res: Response) => {
    const input = atualizarSacadoSchema.parse(req.body);
    res.json(await sacadosService.atualizar(paramString(req, "id"), input, usuarioAtual(req)));
  }),
};
