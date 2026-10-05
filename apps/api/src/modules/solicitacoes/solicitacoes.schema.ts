import { z } from "zod";

export const criarTipoSolicitacaoSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório").max(100),
  descricao: z.string().trim().max(300).nullable().optional(),
  ordem: z.coerce.number().int().min(0).max(999).default(0),
  ativo: z.boolean().default(true),
});

export const atualizarTipoSolicitacaoSchema = criarTipoSolicitacaoSchema
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, "Informe ao menos um campo para atualizar");

export const recusarSolicitacaoSchema = z.object({
  motivo: z.string().trim().min(1, "Informe o motivo da recusa").max(1000),
});

export const atenderSolicitacaoSchema = z.object({
  resposta: z.string().trim().max(1000).optional(),
});

export type CriarTipoSolicitacaoInput = z.infer<typeof criarTipoSolicitacaoSchema>;
export type AtualizarTipoSolicitacaoInput = z.infer<typeof atualizarTipoSolicitacaoSchema>;
