import { z } from "zod";

/** Mês de referência "YYYY-MM" (a competência da nota é o último dia desse mês). */
export const mesReferenciaSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês inválido (use AAAA-MM)")
  .transform((valor) => {
    const [ano, mes] = valor.split("-").map(Number);
    return { ano, mes };
  });

export const consultaNfseSchema = z.object({
  mes: mesReferenciaSchema.optional(),
});

export const emitirNfseSchema = z.object({
  mes: mesReferenciaSchema.optional(),
});

/** Data "AAAA-MM-DD". */
const dataIsoSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use AAAA-MM-DD)");

export const buscaPagamentosSchema = z.object({
  busca: z.string().trim().max(100).optional(),
  de: dataIsoSchema.optional(),
  ate: dataIsoSchema.optional(),
});

export const emitirIndividualSchema = z.object({
  competencia: dataIsoSchema.optional(),
});

/** Certificado A1: o arquivo .pfx em base64 (cerca de 3–6 KB) e a senha. */
export const certificadoSchema = z.object({
  pfxBase64: z.string().min(100).max(200_000),
  senha: z.string().min(1).max(200),
});
