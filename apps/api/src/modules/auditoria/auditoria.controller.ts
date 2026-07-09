import { Request, Response } from "express";
import { asyncHandler } from "../../shared/utils/async-handler";
import { listarAuditoriaSchema } from "./auditoria.schema";
import { auditoriaQueryService } from "./auditoria.query-service";

export const auditoriaController = {
  listar: asyncHandler(async (req: Request, res: Response) => {
    const filtros = listarAuditoriaSchema.parse(req.query);
    const resultado = await auditoriaQueryService.listar(filtros);
    res.json(resultado);
  }),

  listarEntidades: asyncHandler(async (_req: Request, res: Response) => {
    const entidades = await auditoriaQueryService.listarEntidades();
    res.json(entidades);
  }),
};
