import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { importacaoController } from "./importacao.controller";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads", "importacao");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const EXTENSOES_PERMITIDAS = [".xlsx", ".xls"];

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    cb(null, `${randomUUID()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = EXTENSOES_PERMITIDAS.includes(path.extname(file.originalname).toLowerCase());
    if (!ok) {
      cb(new Error("Apenas arquivos .xlsx/.xls são aceitos"));
      return;
    }
    cb(null, true);
  },
});

export const importacaoRouter = Router();

importacaoRouter.post("/upload", upload.single("arquivo"), importacaoController.upload);
importacaoRouter.get("/jobs/:jobId/status", importacaoController.statusJob);
importacaoRouter.get("/", importacaoController.listar);
importacaoRouter.get("/:id", importacaoController.buscarPorId);
