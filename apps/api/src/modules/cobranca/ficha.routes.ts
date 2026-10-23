import { Router } from "express";
import { fichaController } from "./ficha.controller";

export const fichaRouter = Router();

fichaRouter.get("/:matriculaId", fichaController.obterFicha);
fichaRouter.put("/:matriculaId/situacao", fichaController.mudarSituacao);
fichaRouter.put("/:matriculaId/parcelas/:parcelaId/situacao", fichaController.mudarSituacaoParcela);
fichaRouter.post("/:matriculaId/renegociacoes/simular", fichaController.simularRenegociacao);
fichaRouter.post("/:matriculaId/renegociacoes", fichaController.renegociar);
fichaRouter.post("/:matriculaId/tags", fichaController.adicionarTag);
fichaRouter.delete("/:matriculaId/tags/:tagId", fichaController.removerTag);
fichaRouter.post("/:matriculaId/observacoes", fichaController.adicionarObservacao);
