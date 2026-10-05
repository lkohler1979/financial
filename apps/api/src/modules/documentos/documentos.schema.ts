import { z } from "zod";

export const atualizarDocumentoSchema = z
  .object({
    situacaoEntrega: z.enum(["NAO_ENVIADO", "ENVIADO"]).optional(),
    situacaoDeferimento: z.enum(["PENDENTE", "DEFERIDO", "INDEFERIDO"]).optional(),
    vencimento: z.union([z.coerce.date(), z.null()]).optional(),
    observacaoInterna: z.string().trim().max(2000).nullable().optional(),
    observacaoAluno: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, "Informe ao menos um campo para atualizar");

export type AtualizarDocumentoInput = z.infer<typeof atualizarDocumentoSchema>;
