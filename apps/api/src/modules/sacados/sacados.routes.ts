import { Router } from "express";
import { requireRole } from "../../middlewares/auth";
import { sacadosController } from "./sacados.controller";

export const sacadosRouter = Router();

sacadosRouter.get("/", sacadosController.buscar);
sacadosRouter.get("/lista", sacadosController.listar);
sacadosRouter.get("/:id/ficha", sacadosController.ficha);
sacadosRouter.get("/:id", sacadosController.buscarPorId);
sacadosRouter.delete("/:id", requireRole("ADMINISTRADOR", "FINANCEIRO"), sacadosController.remover);
sacadosRouter.post("/", sacadosController.criar);
sacadosRouter.put("/:id", sacadosController.atualizar);
