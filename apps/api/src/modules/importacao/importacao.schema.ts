import { z } from "zod";

// Colunas estruturais (PRD seção 11) — a lógica de localizar/criar Aluno,
// Curso, Matrícula e Parcela depende diretamente delas, então continuam
// fixas. Todas as demais colunas (endereço, contato, dados complementares de
// matrícula/parcela) são configuráveis na tela de Configurações
// (MapeamentoImportacao) e passam intactas via `.passthrough()` — o processor
// as lê pelo nome configurado, não por uma chave fixa aqui.
export const linhaPlanilhaSchema = z
  .object({
    CNPJ_CPF: z.union([z.string(), z.number()]),
    NOME: z.string().trim().min(1, "Nome é obrigatório"),
    COD_TITULO: z.union([z.string(), z.number()]),
    PARCELA: z.union([z.string(), z.number()]),
    DT_VENCIMENTO: z.union([z.string(), z.number(), z.date()]),
    VALOR: z.union([z.string(), z.number()]),
    CURSO: z.string().trim().min(1, "Curso é obrigatório"),
    // Identificador do curso no sistema de origem da planilha — opcional
    // (planilhas antigas não trazem essa coluna). Quando presente, é usado
    // para localizar/criar o Curso de forma mais confiável do que por nome
    // (ver importacao.processor.ts).
    ID_CURSO: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

export type LinhaPlanilha = z.infer<typeof linhaPlanilhaSchema>;

export const listarImportacoesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListarImportacoesInput = z.infer<typeof listarImportacoesSchema>;
