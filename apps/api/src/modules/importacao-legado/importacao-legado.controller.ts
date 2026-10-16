import { Request, Response } from "express";
import { asyncHandler } from "../../shared/utils/async-handler";
import { usuarioAtual } from "../../shared/utils/http";
import { importacaoLegadoService } from "./importacao-legado.service";
import { importacaoLegadoLoteService } from "./importacao-legado-lote.service";
import { buscarPorCpfSchema, confirmarImportacaoSchema, iniciarLoteSchema } from "./importacao-legado.schema";

export const importacaoLegadoController = {
  buscarPorCpf: asyncHandler(async (req: Request, res: Response) => {
    const input = buscarPorCpfSchema.parse(req.query);
    const resultado = await importacaoLegadoService.buscarPorCpf(input.cpf);
    res.json(resultado);
  }),

  confirmar: asyncHandler(async (req: Request, res: Response) => {
    const input = confirmarImportacaoSchema.parse(req.body);
    const resultado = await importacaoLegadoService.confirmarImportacao(input, usuarioAtual(req));
    res.status(201).json(resultado);
  }),

  /** Dispara a busca de TODOS os alunos do legado (roda em segundo plano no worker). */
  iniciarLote: asyncHandler(async (req: Request, res: Response) => {
    const { limite } = iniciarLoteSchema.parse(req.body ?? {});
    const lote = await importacaoLegadoLoteService.iniciar(usuarioAtual(req), limite);
    res.status(202).json(lote);
  }),

  /** Andamento do último lote (ou null se nunca rodou). */
  ultimoLote: asyncHandler(async (_req: Request, res: Response) => {
    res.json((await importacaoLegadoLoteService.ultimo()) ?? null);
  }),
};
