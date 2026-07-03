import { z } from "zod";

const dadosSituacao = {
  nome: z.string().trim().min(1, "Nome é obrigatório").max(100),
  cor: z.string().trim().min(1, "Cor é obrigatória").max(20),
  ordem: z.coerce.number().int().min(0).default(0),
  ativa: z.boolean().default(true),
  descricao: z.string().trim().max(500).optional(),
  participaNovosRelatorios: z.boolean().default(true),
};

export const criarSituacaoSchema = z.object(dadosSituacao);

export const atualizarSituacaoSchema = z
  .object(dadosSituacao)
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, "Informe ao menos um campo para atualizar");

export const listarSituacoesSchema = z.object({
  ativa: z.coerce.boolean().optional(),
});

export type CriarSituacaoInput = z.infer<typeof criarSituacaoSchema>;
export type AtualizarSituacaoInput = z.infer<typeof atualizarSituacaoSchema>;
export type ListarSituacoesInput = z.infer<typeof listarSituacoesSchema>;
