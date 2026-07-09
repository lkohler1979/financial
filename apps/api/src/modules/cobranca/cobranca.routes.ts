import { Router } from "express";
import { requireRole } from "../../middlewares/auth";
import { situacoesRouter } from "./situacoes.routes";
import { tagsRouter } from "./tags.routes";
import { fichaRouter } from "./ficha.routes";
import { fichaController } from "./ficha.controller";

export const cobrancaRouter = Router();

cobrancaRouter.use("/situacoes", situacoesRouter);
cobrancaRouter.use("/tags", tagsRouter);
// Gestão de cobrança (lote, ficha por matrícula, histórico, observações) não
// está no escopo dos perfis FINANCEIRO/USUARIO (ver docs/PENDENCIAS.md).
cobrancaRouter.post("/lote", requireRole("ADMINISTRADOR"), fichaController.aplicarLote);
cobrancaRouter.use("/matriculas", requireRole("ADMINISTRADOR"), fichaRouter);
