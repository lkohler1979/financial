import { Router } from "express";
import { alunosController } from "./alunos.controller";

export const alunosRouter = Router();

alunosRouter.get("/", alunosController.listar);
alunosRouter.get("/contadores", alunosController.contadores);
alunosRouter.get("/:id/resumo", alunosController.resumo);
alunosRouter.get("/:id", alunosController.buscarPorId);
alunosRouter.post("/", alunosController.criar);
alunosRouter.put("/:id", alunosController.atualizar);
alunosRouter.delete("/:id", alunosController.remover);
