import { z } from "zod";

// Colunas exatamente como definidas no PRD seção 11 (cabeçalho da planilha).
// Os valores chegam como string/número/data dependendo de como a célula foi
// formatada na planilha de origem — a normalização de tipo acontece no processor.
export const linhaPlanilhaSchema = z.object({
  DATA_MATRICULA: z.union([z.string(), z.number(), z.date()]).optional(),
  TP_PESSOA: z.union([z.string(), z.number()]).optional(),
  CNPJ_CPF: z.union([z.string(), z.number()]),
  NOME: z.string().trim().min(1, "Nome é obrigatório"),
  ENDEREÇO: z.union([z.string(), z.number()]).optional(),
  EMAIL: z.union([z.string(), z.number()]).optional(),
  FONE: z.union([z.string(), z.number()]).optional(),
  "CONTRATO ASSINADO": z.union([z.string(), z.number(), z.boolean()]).optional(),
  COD_TITULO: z.union([z.string(), z.number()]),
  PARCELA: z.union([z.string(), z.number()]),
  DT_VENCIMENTO: z.union([z.string(), z.number(), z.date()]),
  VALOR: z.union([z.string(), z.number()]),
  TIPO_TITULO: z.union([z.string(), z.number()]).optional(),
  CURSO: z.string().trim().min(1, "Curso é obrigatório"),
});

export type LinhaPlanilha = z.infer<typeof linhaPlanilhaSchema>;

export const listarImportacoesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListarImportacoesInput = z.infer<typeof listarImportacoesSchema>;
