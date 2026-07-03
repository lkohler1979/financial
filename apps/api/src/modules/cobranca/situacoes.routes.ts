import { Router } from "express";
import { situacoesController } from "./situacoes.controller";

export const situacoesRouter = Router();

situacoesRouter.get("/", situacoesController.listar);
situacoesRouter.get("/:id", situacoesController.buscarPorId);
situacoesRouter.post("/", situacoesController.criar);
situacoesRouter.put("/:id", situacoesController.atualizar);
situacoesRouter.delete("/:id", situacoesController.remover);
