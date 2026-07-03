import { z } from "zod";

const dadosCurso = {
  codigo: z.string().trim().min(1, "Código é obrigatório").max(50),
  nome: z.string().trim().min(1, "Nome é obrigatório").max(200),
  situacao: z.boolean().optional(),
  observacoes: z.string().trim().max(1000).optional(),
};

export const criarCursoSchema = z.object(dadosCurso);

// Código é editável (PRD seção 8), portanto pode aparecer no update.
export const atualizarCursoSchema = z
  .object(dadosCurso)
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, "Informe ao menos um campo para atualizar");

export const listarCursosSchema = z.object({
  busca: z.string().trim().optional(),
  situacao: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type CriarCursoInput = z.infer<typeof criarCursoSchema>;
export type AtualizarCursoInput = z.infer<typeof atualizarCursoSchema>;
export type ListarCursosInput = z.infer<typeof listarCursosSchema>;
