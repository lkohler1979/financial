import { Router } from "express";
import { cursosController } from "./cursos.controller";

export const cursosRouter = Router();

cursosRouter.get("/", cursosController.listar);
cursosRouter.get("/:id", cursosController.buscarPorId);
cursosRouter.post("/", cursosController.criar);
cursosRouter.put("/:id", cursosController.atualizar);
cursosRouter.delete("/:id", cursosController.remover);
