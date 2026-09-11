import { Router } from "express";
import { requireRole } from "../../middlewares/auth";
import { sincronizacaoLegadoController } from "./sincronizacao-legado.controller";

export const sincronizacaoLegadoRouter = Router();

// Consulta pontual (botão na ficha de cobrança/matrícula): mesmo acesso de
// financeiro/matrículas. Disparo em lote e histórico de execuções: só
// ADMINISTRADOR (mesmo critério de Configurações, decisão do grilling 2026-09-11).
sincronizacaoLegadoRouter.post(
  "/matriculas/:matriculaId/sincronizar",
  requireRole("ADMINISTRADOR", "FINANCEIRO"),
  sincronizacaoLegadoController.sincronizarMatricula,
);
sincronizacaoLegadoRouter.post("/lote", requireRole("ADMINISTRADOR"), sincronizacaoLegadoController.dispararLote);
sincronizacaoLegadoRouter.get(
  "/lote/:jobId/status",
  requireRole("ADMINISTRADOR"),
  sincronizacaoLegadoController.statusJob,
);
sincronizacaoLegadoRouter.get(
  "/execucoes",
  requireRole("ADMINISTRADOR"),
  sincronizacaoLegadoController.listarExecucoes,
);
