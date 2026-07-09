import { Router } from "express";
import { auditoriaController } from "./auditoria.controller";

export const auditoriaRouter = Router();

auditoriaRouter.get("/entidades", auditoriaController.listarEntidades);
auditoriaRouter.get("/", auditoriaController.listar);
