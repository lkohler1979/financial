import { Router } from "express";
import { matriculasController } from "./matriculas.controller";

export const matriculasRouter = Router();

matriculasRouter.get("/", matriculasController.listar);
matriculasRouter.get("/:id", matriculasController.buscarPorId);
matriculasRouter.post("/", matriculasController.criar);
matriculasRouter.put("/:id", matriculasController.atualizar);
matriculasRouter.delete("/:id", matriculasController.remover);
