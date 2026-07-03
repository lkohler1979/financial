import { z } from "zod";

const dadosMatricula = {
  numeroMatricula: z.string().trim().max(50).optional(),
  dataMatricula: z.coerce.date().optional(),
  contratoAssinado: z.boolean().optional(),
  situacao: z.string().trim().min(1).max(50).optional(),
  observacoes: z.string().trim().max(1000).optional(),
};

export const criarMatriculaSchema = z.object({
  alunoId: z.string().uuid("alunoId inválido"),
  cursoId: z.string().uuid("cursoId inválido"),
  ...dadosMatricula,
});

// Vínculo aluno/curso e número da matrícula podem ser ajustados na edição.
export const atualizarMatriculaSchema = z
  .object({
    alunoId: z.string().uuid("alunoId inválido").optional(),
    cursoId: z.string().uuid("cursoId inválido").optional(),
    ...dadosMatricula,
  })
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, "Informe ao menos um campo para atualizar");

export const listarMatriculasSchema = z.object({
  alunoId: z.string().uuid().optional(),
  cursoId: z.string().uuid().optional(),
  situacao: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type CriarMatriculaInput = z.infer<typeof criarMatriculaSchema>;
export type AtualizarMatriculaInput = z.infer<typeof atualizarMatriculaSchema>;
export type ListarMatriculasInput = z.infer<typeof listarMatriculasSchema>;
