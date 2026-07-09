import { Router } from "express";
import { mapeamentoImportacaoController } from "./mapeamento-importacao.controller";

export const mapeamentoImportacaoRouter = Router();

mapeamentoImportacaoRouter.get("/campos", mapeamentoImportacaoController.camposDisponiveis);
mapeamentoImportacaoRouter.get("/", mapeamentoImportacaoController.listar);
mapeamentoImportacaoRouter.post("/", mapeamentoImportacaoController.criar);
mapeamentoImportacaoRouter.put("/:id", mapeamentoImportacaoController.atualizar);
mapeamentoImportacaoRouter.delete("/:id", mapeamentoImportacaoController.remover);
