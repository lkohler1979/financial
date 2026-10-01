import { z } from "zod";

export const gerarCobrancaSchema = z.object({
  billingType: z.enum(["BOLETO", "PIX", "CREDIT_CARD"]),
});

export type GerarCobrancaInput = z.infer<typeof gerarCobrancaSchema>;

// Validação solta de propósito: o Asaas envia bem mais campos do que
// usamos (ver docs/guia-de-cobrancas) — só validamos o que o service
// realmente lê, pra não quebrar com um webhook válido só porque ganhou um
// campo novo que não conhecemos ainda.
export const asaasWebhookSchema = z.object({
  event: z.string(),
  payment: z
    .object({
      id: z.string(),
      value: z.coerce.number().optional(),
      paymentDate: z.string().nullish(),
    })
    .optional(),
});

export type AsaasWebhookPayload = z.infer<typeof asaasWebhookSchema>;
