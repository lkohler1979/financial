import { Router } from "express";
import { fichaController } from "./ficha.controller";

export const fichaRouter = Router();

fichaRouter.get("/:matriculaId", fichaController.obterFicha);
fichaRouter.put("/:matriculaId/situacao", fichaController.mudarSituacao);
fichaRouter.post("/:matriculaId/tags", fichaController.adicionarTag);
fichaRouter.delete("/:matriculaId/tags/:tagId", fichaController.removerTag);
fichaRouter.post("/:matriculaId/observacoes", fichaController.adicionarObservacao);
