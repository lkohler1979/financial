import { Router } from "express";
import multer from "multer";
import { requireRole } from "../../middlewares/auth";
import { solicitacoesController } from "./solicitacoes.controller";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Fila de pedidos dos alunos: toda a equipe atende; tipos só o administrador.
export const solicitacoesRouter = Router();

solicitacoesRouter.get("/tipos", solicitacoesController.listarTipos);
solicitacoesRouter.post("/tipos", requireRole("ADMINISTRADOR"), solicitacoesController.criarTipo);
solicitacoesRouter.put("/tipos/:id", requireRole("ADMINISTRADOR"), solicitacoesController.atualizarTipo);
solicitacoesRouter.get("/", solicitacoesController.listar);
solicitacoesRouter.post("/:id/atender", upload.single("arquivo"), solicitacoesController.atender);
solicitacoesRouter.post("/:id/recusar", solicitacoesController.recusar);
solicitacoesRouter.get("/:id/arquivo", solicitacoesController.baixarArquivo);
