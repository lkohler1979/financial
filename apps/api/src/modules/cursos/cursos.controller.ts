import { Request, Response } from "express";
import { asyncHandler } from "../../shared/utils/async-handler";
import { paramString, usuarioAtual } from "../../shared/utils/http";
import { atualizarCursoSchema, criarCursoSchema, listarCursosSchema } from "./cursos.schema";
import { cursosService } from "./cursos.service";

export const cursosController = {
  listar: asyncHandler(async (req: Request, res: Response) => {
    const params = listarCursosSchema.parse(req.query);
    const resultado = await cursosService.listar(params);
    res.json(resultado);
  }),

  buscarPorId: asyncHandler(async (req: Request, res: Response) => {
    const curso = await cursosService.buscarPorId(paramString(req, "id"));
    res.json(curso);
  }),

  criar: asyncHandler(async (req: Request, res: Response) => {
    const input = criarCursoSchema.parse(req.body);
    const curso = await cursosService.criar(input, usuarioAtual(req));
    res.status(201).json(curso);
  }),

  atualizar: asyncHandler(async (req: Request, res: Response) => {
    const input = atualizarCursoSchema.parse(req.body);
    const curso = await cursosService.atualizar(paramString(req, "id"), input, usuarioAtual(req));
    res.json(curso);
  }),

  remover: asyncHandler(async (req: Request, res: Response) => {
    await cursosService.remover(paramString(req, "id"), usuarioAtual(req));
    res.status(204).send();
  }),
};
