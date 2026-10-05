import { Router } from "express";
import { requireRole } from "../../middlewares/auth";
import { cuponsController } from "./cupons.controller";

// Validar (usado no cadastro da matrícula) é liberado; cadastrar/alterar só o administrador.
export const cuponsRouter = Router();

cuponsRouter.get("/validar", cuponsController.validar);
cuponsRouter.get("/", requireRole("ADMINISTRADOR"), cuponsController.listar);
cuponsRouter.post("/", requireRole("ADMINISTRADOR"), cuponsController.criar);
cuponsRouter.put("/:id", requireRole("ADMINISTRADOR"), cuponsController.atualizar);
