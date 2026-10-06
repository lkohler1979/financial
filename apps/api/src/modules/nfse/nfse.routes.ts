import { Router } from "express";
import { nfseController } from "./nfse.controller";

export const nfseRouter = Router();

nfseRouter.get("/previa", nfseController.previa);
nfseRouter.post("/emitir", nfseController.emitir);
nfseRouter.post("/atualizar-status", nfseController.atualizarStatus);
nfseRouter.post("/parcelas/:parcelaId/emitir", nfseController.reemitirParcela);
