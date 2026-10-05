import { Router } from "express";
import { requireRole } from "../../middlewares/auth";
import { tiposCobrancaController } from "./tipos-cobranca.controller";

// Leitura liberada a quem cadastra matrícula; só o administrador altera os tipos.
export const tiposCobrancaRouter = Router();

tiposCobrancaRouter.get("/", tiposCobrancaController.listar);
tiposCobrancaRouter.get("/formas-pagamento", tiposCobrancaController.formasPagamento);
tiposCobrancaRouter.post("/", requireRole("ADMINISTRADOR"), tiposCobrancaController.criar);
tiposCobrancaRouter.put("/:id", requireRole("ADMINISTRADOR"), tiposCobrancaController.atualizar);
