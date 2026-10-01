import { z } from "zod";

// Validação solta (igual ao padrão do asaas.schema.ts) — só os campos que
// realmente usamos do payload de notificação de Pix da Rede.
export const redeWebhookSchema = z.object({
  id: z.string().optional(),
  merchantId: z.string().optional(),
  events: z.array(z.string()).optional(),
  data: z
    .object({
      txid: z.string().optional(),
      id: z.string().optional(),
      endToEndId: z.string().optional(),
    })
    .optional(),
});

export type RedeWebhookPayload = z.infer<typeof redeWebhookSchema>;
