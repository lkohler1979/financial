import { Router } from "express";
import { matriculasController } from "./matriculas.controller";

export const matriculasRouter = Router();

matriculasRouter.get("/", matriculasController.listar);
matriculasRouter.get("/agentes", matriculasController.listarAgentes);
matriculasRouter.get("/situacoes", matriculasController.listarSituacoes);
matriculasRouter.get("/:id", matriculasController.buscarPorId);
matriculasRouter.get("/:id/situacao/historico", matriculasController.historicoSituacao);
matriculasRouter.put("/:id/sacado", matriculasController.alterarSacado);
matriculasRouter.post("/:id/situacao", matriculasController.alterarSituacao);
matriculasRouter.post("/", matriculasController.criar);
matriculasRouter.put("/:id", matriculasController.atualizar);
matriculasRouter.delete("/:id", matriculasController.remover);
matriculasRouter.post("/:id/gerar-parcelas", matriculasController.gerarParcelas);
