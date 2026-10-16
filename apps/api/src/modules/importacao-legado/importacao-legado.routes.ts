import { Router } from "express";
import { requireRole } from "../../middlewares/auth";
import { importacaoLegadoController } from "./importacao-legado.controller";

export const importacaoLegadoRouter = Router();

// Mesmo critério de acesso do botão manual de sincronização com o legado
// (ADMINISTRADOR/FINANCEIRO) — decisão do usuário, 2026-09-15, já que esta
// rota cria registros novos (Aluno/Matrícula/Parcela), não só atualiza.
importacaoLegadoRouter.get(
  "/buscar-cpf",
  requireRole("ADMINISTRADOR", "FINANCEIRO"),
  importacaoLegadoController.buscarPorCpf,
);
importacaoLegadoRouter.post(
  "/confirmar",
  requireRole("ADMINISTRADOR", "FINANCEIRO"),
  importacaoLegadoController.confirmar,
);

// Busca em lote: cria aluno/matrícula/parcelas de todo o legado — mesmo critério de acesso acima.
importacaoLegadoRouter.post(
  "/lote",
  requireRole("ADMINISTRADOR", "FINANCEIRO"),
  importacaoLegadoController.iniciarLote,
);
importacaoLegadoRouter.get(
  "/lote/atual",
  requireRole("ADMINISTRADOR", "FINANCEIRO"),
  importacaoLegadoController.ultimoLote,
);
