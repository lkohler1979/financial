import { z } from "zod";

export const filtrosElegibilidadeSchema = z.object({
  diasAtraso: z.coerce.number().int().min(0).optional(),
  valorMinimo: z.coerce.number().min(0).optional(),
  cursoId: z.string().uuid().optional(),
  // Filtros de cobrança (PRD seção 23.4/23.6, wireframe 04_relatorio_inadimplencia.html).
  situacaoCobrancaId: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),
  ignorarSituacoesTratadas: z.coerce.boolean().default(true),
  // Decisão do usuário, 2026-07-07: por padrão o protesto só inclui parcelas
  // vencidas há mais de `diasAtraso` dias; esta opção estende o documento
  // para incluir também as parcelas só "vencidas" (dentro do mínimo) da
  // mesma matrícula. Só importa no momento da geração (relatorios.gerar).
  incluirParcelasVencidasRecentes: z.coerce.boolean().default(false),
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
