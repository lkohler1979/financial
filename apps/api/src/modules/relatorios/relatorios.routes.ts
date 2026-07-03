import { Router } from "express";
import { relatoriosController } from "./relatorios.controller";

export const relatoriosRouter = Router();

relatoriosRouter.get("/elegiveis", relatoriosController.previaElegiveis);
relatoriosRouter.get("/:id/itens/:matriculaId/documento", relatoriosController.baixarDocumento);
relatoriosRouter.get("/:id", relatoriosController.buscarPorId);
relatoriosRouter.get("/", relatoriosController.listar);
relatoriosRouter.post("/", relatoriosController.gerar);
