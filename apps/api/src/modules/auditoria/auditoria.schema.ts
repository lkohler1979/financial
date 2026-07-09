import { z } from "zod";

export const listarAuditoriaSchema = z
  .object({
    entidade: z.string().trim().optional(),
    usuario: z.string().trim().optional(),
    acao: z.enum(["CRIACAO", "ATUALIZACAO", "EXCLUSAO"]).optional(),
    dataInicio: z.coerce.date().optional(),
    dataFim: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine(
    (filtros) => !filtros.dataInicio || !filtros.dataFim || filtros.dataInicio <= filtros.dataFim,
    "Data inicial deve ser menor ou igual à data final",
  );

export type ListarAuditoriaInput = z.infer<typeof listarAuditoriaSchema>;
