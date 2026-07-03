import { z } from "zod";

export const filtrosElegibilidadeSchema = z.object({
  parcelasMinimas: z.coerce.number().int().min(0).optional(),
  diasAtraso: z.coerce.number().int().min(0).optional(),
  valorMinimo: z.coerce.number().min(0).optional(),
  cursoId: z.string().uuid().optional(),
  // Filtros de cobrança (PRD seção 23.4/23.6, wireframe 04_relatorio_inadimplencia.html).
  situacaoCobrancaId: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),
  ignorarSituacoesTratadas: z.coerce.boolean().default(true),
});

// Se `matriculaIds` for informado, a geração fica restrita a essa seleção
// (ação em lote a partir da prévia de elegíveis); caso contrário, gera para
// todos os elegíveis pelos filtros.
export const gerarRelatorioSchema = filtrosElegibilidadeSchema.extend({
  matriculaIds: z.array(z.string().uuid()).optional(),
});

export const listarRelatoriosSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type FiltrosElegibilidadeInput = z.infer<typeof filtrosElegibilidadeSchema>;
export type GerarRelatorioInput = z.infer<typeof gerarRelatorioSchema>;
export type ListarRelatoriosInput = z.infer<typeof listarRelatoriosSchema>;
