import { Router } from "express";
import { financeiroController } from "./financeiro.controller";

export const financeiroRouter = Router();

// Sem rota de exclusão: Parcela é append-first (PRD seção 12) — cancelamentos
// são feitos via atualização de status para CANCELADO.
financeiroRouter.get("/", financeiroController.listar);
financeiroRouter.get("/:id", financeiroController.buscarPorId);
financeiroRouter.post("/", financeiroController.criar);
financeiroRouter.put("/:id", financeiroController.atualizar);
