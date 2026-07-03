import { Router } from "express";
import { situacoesRouter } from "./situacoes.routes";
import { tagsRouter } from "./tags.routes";
import { fichaRouter } from "./ficha.routes";
import { fichaController } from "./ficha.controller";

export const cobrancaRouter = Router();

cobrancaRouter.use("/situacoes", situacoesRouter);
cobrancaRouter.use("/tags", tagsRouter);
cobrancaRouter.post("/lote", fichaController.aplicarLote);
cobrancaRouter.use("/matriculas", fichaRouter);
