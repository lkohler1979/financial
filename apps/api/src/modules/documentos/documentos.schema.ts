import { z } from "zod";

export const atualizarDocumentoSchema = z
  .object({
    situacaoEntrega: z.enum(["NAO_ENVIADO", "ENVIADO"]).optional(),
    situacaoDeferimento: z.enum(["PENDENTE", "DEFERIDO", "INDEFERIDO"]).optional(),
    vencimento: z.union([z.coerce.date(), z.null()]).optional(),
    observacaoInterna: z.string().trim().max(2000).nullable().optional(),
    observacaoAluno: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, "Informe ao menos um campo para atualizar");

export const criarTipoDocumentoSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório").max(100),
  escopo: z.enum(["ALUNO", "MATRICULA"]),
  obrigatorio: z.boolean().default(true),
  ordem: z.coerce.number().int().min(0).max(999).default(0),
  ativo: z.boolean().default(true),
});

export const atualizarTipoDocumentoSchema = z
  .object({
    nome: z.string().trim().min(1).max(100),
    obrigatorio: z.boolean(),
    ordem: z.coerce.number().int().min(0).max(999),
    ativo: z.boolean(),
  })
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, "Informe ao menos um campo para atualizar");

/** Listagem de todos os documentos enviados (tela Documentos). */
const filtrosDocumentos = {
  situacao: z.enum(["PENDENTE", "DEFERIDO", "INDEFERIDO"]).optional(),
  busca: z.string().trim().max(100).optional(),
  tipoId: z.string().uuid().optional(),
  cursoId: z.string().uuid().optional(),
  /** Período de envio do arquivo (AAAA-MM-DD, inclusive). */
  de: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  ate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
};

export const listarDocumentosSchema = z.object({
  ...filtrosDocumentos,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Máximo de documentos por download em lote. */
export const MAX_DOCUMENTOS_LOTE = 500;

/** Download em lote: ids escolhidos na tela OU os filtros da consulta (todos que casam). */
export const downloadLoteSchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1).max(MAX_DOCUMENTOS_LOTE).optional(),
    filtros: z.object(filtrosDocumentos).optional(),
  })
  .refine((v) => v.ids || v.filtros, "Informe os documentos ou os filtros do download");

export type DownloadLoteInput = z.infer<typeof downloadLoteSchema>;
export type ListarDocumentosInput = z.infer<typeof listarDocumentosSchema>;
export type CriarTipoDocumentoInput = z.infer<typeof criarTipoDocumentoSchema>;
export type AtualizarTipoDocumentoInput = z.infer<typeof atualizarTipoDocumentoSchema>;
export type AtualizarDocumentoInput = z.infer<typeof atualizarDocumentoSchema>;
