import { Router } from "express";
import { sacadosController } from "./sacados.controller";

export const sacadosRouter = Router();

sacadosRouter.get("/", sacadosController.buscar);
sacadosRouter.get("/:id", sacadosController.buscarPorId);
sacadosRouter.post("/", sacadosController.criar);
sacadosRouter.put("/:id", sacadosController.atualizar);
