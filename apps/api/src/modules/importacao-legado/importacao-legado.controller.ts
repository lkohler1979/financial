import { Request, Response } from "express";
import { asyncHandler } from "../../shared/utils/async-handler";
import { usuarioAtual } from "../../shared/utils/http";
import { importacaoLegadoService } from "./importacao-legado.service";
import { buscarPorCpfSchema, confirmarImportacaoSchema } from "./importacao-legado.schema";

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
};
