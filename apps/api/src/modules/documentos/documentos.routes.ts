import { Router } from "express";
import multer from "multer";
import { documentosController } from "./documentos.controller";

// Em memória (limite de 10MB) — o service decide onde gravar via
// shared/armazenamento, pra poder trocar o destino (ex.: S3) depois.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export const documentosRouter = Router();

documentosRouter.get("/tipos", documentosController.listarTipos);
documentosRouter.get("/matriculas/:matriculaId", documentosController.listarDaMatricula);
documentosRouter.post(
  "/matriculas/:matriculaId/tipos/:tipoId/arquivo",
  upload.single("arquivo"),
  documentosController.anexarArquivo,
);
documentosRouter.put("/matriculas/:matriculaId/tipos/:tipoId", documentosController.atualizar);
documentosRouter.delete("/:documentoId/arquivo", documentosController.removerArquivo);
documentosRouter.get("/:documentoId/arquivo", documentosController.baixarArquivo);
