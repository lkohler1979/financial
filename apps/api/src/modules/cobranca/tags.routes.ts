import { Router } from "express";
import { requireRole } from "../../middlewares/auth";
import { tagsController } from "./tags.controller";

export const tagsRouter = Router();

// Leitura fica disponível para qualquer perfil autenticado (mesmo motivo de
// situacoes.routes.ts — filtros da tela de Relatórios).
tagsRouter.get("/", requireRole("ADMINISTRADOR", "FINANCEIRO", "USUARIO"), tagsController.listar);
tagsRouter.post("/", requireRole("ADMINISTRADOR"), tagsController.criar);
tagsRouter.delete("/:id", requireRole("ADMINISTRADOR"), tagsController.remover);
