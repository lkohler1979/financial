import { Request, Response } from "express";
import { asyncHandler } from "../../shared/utils/async-handler";
import { paramString, usuarioAtual } from "../../shared/utils/http";
import { atualizarAlunoSchema, criarAlunoSchema, listarAlunosSchema } from "./alunos.schema";
import { alunosService } from "./alunos.service";

export const alunosController = {
  listar: asyncHandler(async (req: Request, res: Response) => {
    const params = listarAlunosSchema.parse(req.query);
    const resultado = await alunosService.listar(params);
    res.json(resultado);
  }),

  buscarPorId: asyncHandler(async (req: Request, res: Response) => {
    const aluno = await alunosService.buscarPorId(paramString(req, "id"));
    res.json(aluno);
  }),

  criar: asyncHandler(async (req: Request, res: Response) => {
    const input = criarAlunoSchema.parse(req.body);
    const aluno = await alunosService.criar(input, usuarioAtual(req));
    res.status(201).json(aluno);
  }),

  atualizar: asyncHandler(async (req: Request, res: Response) => {
    const input = atualizarAlunoSchema.parse(req.body);
    const aluno = await alunosService.atualizar(paramString(req, "id"), input, usuarioAtual(req));
    res.json(aluno);
  }),

  remover: asyncHandler(async (req: Request, res: Response) => {
    await alunosService.remover(paramString(req, "id"), usuarioAtual(req));
    res.status(204).send();
  }),
};
