import { Router } from "express";
import multer from "multer";
import { requireRole } from "../../middlewares/auth";
import { contratosController } from "./contratos.controller";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Rotas autenticadas — montadas em app.ts em /api/contratos.
export const contratosRouter = Router();
contratosRouter.get(
  "/campos",
  requireRole("ADMINISTRADOR", "FINANCEIRO"),
  contratosController.campos,
);
contratosRouter.get(
  "/modelo",
  requireRole("ADMINISTRADOR", "FINANCEIRO"),
  contratosController.baixarModelo,
);
contratosRouter.post(
  "/modelo",
  requireRole("ADMINISTRADOR"),
  upload.single("arquivo"),
  contratosController.enviarModelo,
);

const financeiro = requireRole("ADMINISTRADOR", "FINANCEIRO");
contratosRouter.get("/matriculas/:matriculaId", financeiro, contratosController.obter);
contratosRouter.get("/matriculas/:matriculaId/previa", financeiro, contratosController.previa);
contratosRouter.get("/matriculas/:matriculaId/arquivo", financeiro, contratosController.arquivo);
contratosRouter.post("/matriculas/:matriculaId/enviar", financeiro, contratosController.enviar);
contratosRouter.post("/matriculas/:matriculaId/cancelar", financeiro, contratosController.cancelar);
contratosRouter.post(
  "/matriculas/:matriculaId/sincronizar",
  financeiro,
  contratosController.sincronizar,
);

// Webhook público da Clicksign — fora do requireAuth (ver app.ts).
export const clicksignWebhookRouter = Router();
clicksignWebhookRouter.post("/", contratosController.webhook);
