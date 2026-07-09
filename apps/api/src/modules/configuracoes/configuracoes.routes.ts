import { Router } from "express";
import { configuracoesController } from "./configuracoes.controller";

export const configuracoesRouter = Router();

configuracoesRouter.get("/", configuracoesController.obter);
configuracoesRouter.put("/", configuracoesController.atualizar);
configuracoesRouter.post("/limpar-base", configuracoesController.limparBase);
