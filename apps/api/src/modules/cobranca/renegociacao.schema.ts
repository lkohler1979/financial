import { z } from "zod";
import { MAX_PARCELAS_RENEGOCIACAO } from "./renegociacao";

/** AAAA-MM-DD que existe no calendário (rejeita 2026-02-31). */
const dataValida = (v: string) => {
  const [ano, mes, dia] = v.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
};

export const renegociarSchema = z.object({
  parcelaIds: z
    .array(z.string().uuid("Parcela inválida"))
    .min(1, "Selecione ao menos uma parcela")
    .max(200)
    .transform((ids) => [...new Set(ids)]),
  desconto: z.coerce.number().min(0, "O desconto não pode ser negativo").default(0),
  numeroParcelas: z.coerce
    .number()
    .int("Número de parcelas inválido")
    .min(1, "Informe ao menos 1 parcela")
    .max(MAX_PARCELAS_RENEGOCIACAO, `No máximo ${MAX_PARCELAS_RENEGOCIACAO} parcelas`),
  primeiroVencimento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use AAAA-MM-DD)")
    .refine(dataValida, "Data inválida"),
});

export type RenegociarInput = z.infer<typeof renegociarSchema>;
