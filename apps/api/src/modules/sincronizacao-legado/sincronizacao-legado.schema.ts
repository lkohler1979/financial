import { z } from "zod";

export const sincronizarMatriculaParamsSchema = z.object({
  matriculaId: z.string().uuid(),
});

export type SincronizarMatriculaParams = z.infer<typeof sincronizarMatriculaParamsSchema>;

export const listarExecucoesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListarExecucoesInput = z.infer<typeof listarExecucoesSchema>;
