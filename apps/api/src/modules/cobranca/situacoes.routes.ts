import { Router } from "express";
import { requireRole } from "../../middlewares/auth";
import { situacoesController } from "./situacoes.controller";

export const situacoesRouter = Router();

// Leitura fica disponível para qualquer perfil autenticado — a tela de
// Relatórios (FINANCEIRO/USUARIO) usa estas listas só para popular filtros.
situacoesRouter.get("/", requireRole("ADMINISTRADOR", "FINANCEIRO", "USUARIO"), situacoesController.listar);
situacoesRouter.get("/:id", requireRole("ADMINISTRADOR", "FINANCEIRO", "USUARIO"), situacoesController.buscarPorId);
situacoesRouter.post("/", requireRole("ADMINISTRADOR"), situacoesController.criar);
situacoesRouter.put("/:id", requireRole("ADMINISTRADOR"), situacoesController.atualizar);
situacoesRouter.delete("/:id", requireRole("ADMINISTRADOR"), situacoesController.remover);
