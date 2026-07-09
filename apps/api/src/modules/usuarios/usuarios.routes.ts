import { Router } from "express";
import { usuariosController } from "./usuarios.controller";

export const usuariosRouter = Router();

usuariosRouter.get("/", usuariosController.listar);
usuariosRouter.get("/:id", usuariosController.buscarPorId);
usuariosRouter.post("/", usuariosController.criar);
usuariosRouter.put("/:id", usuariosController.atualizar);
usuariosRouter.put("/:id/senha", usuariosController.alterarSenha);
