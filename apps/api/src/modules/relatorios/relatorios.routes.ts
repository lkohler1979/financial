import { Router } from "express";
import { relatoriosController } from "./relatorios.controller";

export const relatoriosRouter = Router();

relatoriosRouter.get("/elegiveis", relatoriosController.previaElegiveis);
relatoriosRouter.get("/jobs/:jobId/status", relatoriosController.statusJob);
relatoriosRouter.get(
  "/matriculas/:matriculaId/ultimo-documento",
  relatoriosController.buscarUltimoDocumentoDaMatricula,
);
relatoriosRouter.get("/:id/itens/:matriculaId/documento", relatoriosController.baixarDocumento);
relatoriosRouter.get("/:id", relatoriosController.buscarPorId);
relatoriosRouter.delete("/:id", relatoriosController.excluir);
relatoriosRouter.get("/", relatoriosController.listar);
relatoriosRouter.post("/", relatoriosController.gerar);
