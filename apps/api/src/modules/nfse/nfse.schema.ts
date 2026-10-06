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
