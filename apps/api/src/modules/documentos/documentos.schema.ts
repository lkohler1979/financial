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

export type CriarTipoDocumentoInput = z.infer<typeof criarTipoDocumentoSchema>;
export type AtualizarTipoDocumentoInput = z.infer<typeof atualizarTipoDocumentoSchema>;
export type AtualizarDocumentoInput = z.infer<typeof atualizarDocumentoSchema>;
