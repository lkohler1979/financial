import { Request, Response } from "express";
import { asyncHandler } from "../../shared/utils/async-handler";
import { paramString, usuarioAtual } from "../../shared/utils/http";
import {
  atualizarParcelaSchema,
  criarParcelaSchema,
  listarParcelasSchema,
} from "./financeiro.schema";
import { financeiroService } from "./financeiro.service";
import { listarTitulosDoAluno } from "../importacao-legado/titulos-legado.service";

export const financeiroController = {
  listar: asyncHandler(async (req: Request, res: Response) => {
    const params = listarParcelasSchema.parse(req.query);
    const resultado = await financeiroService.listar(params);
    res.json(resultado);
  }),

  /** Todos os títulos de um aluno (parcelas de todas as matrículas + títulos sem matrícula). */
  listarTitulosDoAluno: asyncHandler(async (req: Request, res: Response) => {
    res.json(await listarTitulosDoAluno(paramString(req, "alunoId")));
  }),

  buscarPorId: asyncHandler(async (req: Request, res: Response) => {
    const parcela = await financeiroService.buscarPorId(paramString(req, "id"));
    res.json(parcela);
  }),

  criar: asyncHandler(async (req: Request, res: Response) => {
    const input = criarParcelaSchema.parse(req.body);
    const parcela = await financeiroService.criar(input, usuarioAtual(req));
    res.status(201).json(parcela);
  }),

  atualizar: asyncHandler(async (req: Request, res: Response) => {
    const input = atualizarParcelaSchema.parse(req.body);
    const parcela = await financeiroService.atualizar(
      paramString(req, "id"),
      input,
      usuarioAtual(req),
    );
    res.json(parcela);
  }),
};
