import { Router } from "express";
import { requireRole } from "../../middlewares/auth";
import { nfseController } from "./nfse.controller";

export const nfseRouter = Router();

nfseRouter.get("/previa", nfseController.previa);
nfseRouter.post("/emitir", nfseController.emitir);
nfseRouter.post("/atualizar-status", nfseController.atualizarStatus);
nfseRouter.post("/parcelas/:parcelaId/emitir", nfseController.reemitirParcela);

// Nota individual sobre um pagamento realizado
nfseRouter.get("/pagamentos", nfseController.buscarPagamentos);
nfseRouter.post("/parcelas/:parcelaId/emitir-individual", nfseController.emitirIndividual);
nfseRouter.get("/parcelas/:parcelaId/danfse", nfseController.danfse);

// Emissão direta (Portal Nacional): certificado A1 — só o administrador mexe
nfseRouter.get("/nacional/situacao", nfseController.situacaoNacional);
nfseRouter.put("/certificado", requireRole("ADMINISTRADOR"), nfseController.salvarCertificado);
nfseRouter.delete("/certificado", requireRole("ADMINISTRADOR"), nfseController.removerCertificado);
nfseRouter.post("/nacional/testar", requireRole("ADMINISTRADOR"), nfseController.testarConexao);
