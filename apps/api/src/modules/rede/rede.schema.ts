import { z } from "zod";
import { luhnValido, normalizarNomePortador, validadeNaoVencida } from "../../shared/utils/cartao";

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

// Dados do cartão digitados pelo aluno/sacado. Só trafegam até a Rede: não são
// gravados, logados nem devolvidos. A validação aqui poupa uma ida à adquirente.
export const pagamentoCartaoSchema = z
  .object({
    numero: z
      .string()
      .transform((v) => v.replace(/[\s-]/g, ""))
      .refine((v) => luhnValido(v), "Número do cartão inválido"),
    nome: z
      .string()
      .transform(normalizarNomePortador)
      .refine((v) => v.length >= 2, "Informe o nome impresso no cartão"),
    mes: z.coerce.number().int().min(1, "Mês inválido").max(12, "Mês inválido"),
    ano: z.coerce
      .number()
      .int()
      .transform((a) => (a < 100 ? 2000 + a : a)),
    cvv: z.string().regex(/^\d{3,4}$/, "CVV inválido"),
    parcelas: z.coerce.number().int().min(1).max(12).default(1),
  })
  .refine((c) => validadeNaoVencida(c.mes, c.ano), {
    path: ["ano"],
    message: "Cartão vencido",
  });

export type PagamentoCartaoInput = z.infer<typeof pagamentoCartaoSchema>;
