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
importacaoLegadoRouter.get(
  "/lote/:loteId/relatorio",
  requireRole("ADMINISTRADOR", "FINANCEIRO"),
  importacaoLegadoController.relatorioLote,
);

// Títulos que faltam: um aluno (na hora) ou todos (em segundo plano). Não cria aluno nem matrícula.
importacaoLegadoRouter.post(
  "/alunos/:alunoId/titulos",
  requireRole("ADMINISTRADOR", "FINANCEIRO"),
  importacaoLegadoController.importarTitulosDoAluno,
);
importacaoLegadoRouter.post(
  "/titulos/lote",
  requireRole("ADMINISTRADOR", "FINANCEIRO"),
  importacaoLegadoController.iniciarTitulosLote,
);
importacaoLegadoRouter.get(
  "/titulos/lote/atual",
  requireRole("ADMINISTRADOR", "FINANCEIRO"),
  importacaoLegadoController.ultimoTitulosLote,
);

// Documentos do aluno: baixa do legado para apps/documentos e cria/atualiza o Documento.
importacaoLegadoRouter.post(
  "/alunos/:alunoId/documentos",
  requireRole("ADMINISTRADOR", "FINANCEIRO"),
  importacaoLegadoController.importarDocumentos,
);

// Busca de documentos no legado em lote (várias matrículas): roda no worker, com andamento,
// cancelamento e relatório — mesmo critério de acesso do botão de um aluno.
const financeiro = requireRole("ADMINISTRADOR", "FINANCEIRO");
importacaoLegadoRouter.post(
  "/documentos/lote",
  financeiro,
  importacaoLegadoController.iniciarDocumentosLote,
);
importacaoLegadoRouter.get(
  "/documentos/lote/atual",
  financeiro,
  importacaoLegadoController.ultimoDocumentosLote,
);
importacaoLegadoRouter.post(
  "/documentos/lote/:loteId/cancelar",
  financeiro,
  importacaoLegadoController.cancelarDocumentosLote,
);
importacaoLegadoRouter.get(
  "/documentos/lote/:loteId/relatorio",
  financeiro,
  importacaoLegadoController.relatorioDocumentosLote,
);
