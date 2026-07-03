import { z } from "zod";

export const mudarSituacaoSchema = z.object({
  situacaoCobrancaId: z.string().uuid("situacaoCobrancaId inválido"),
});

export const adicionarTagSchema = z.object({
  tagId: z.string().uuid("tagId inválido"),
});

export const criarObservacaoSchema = z.object({
  texto: z.string().trim().min(1, "Texto é obrigatório").max(2000),
});

// Ação em lote a partir do resultado de um relatório de inadimplência
// (wireframe 04_relatorio_inadimplencia.html: "Alterar situação"/"Inserir TAG").
export const aplicarLoteSchema = z.object({
  matriculaIds: z.array(z.string().uuid()).min(1, "Selecione ao menos uma matrícula"),
  situacaoCobrancaId: z.string().uuid().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
  observacao: z.string().trim().max(2000).optional(),
});

export type MudarSituacaoInput = z.infer<typeof mudarSituacaoSchema>;
export type AdicionarTagInput = z.infer<typeof adicionarTagSchema>;
export type CriarObservacaoInput = z.infer<typeof criarObservacaoSchema>;
export type AplicarLoteInput = z.infer<typeof aplicarLoteSchema>;
