import { z } from "zod";
import { pagamentoCartaoSchema } from "../rede/rede.schema";

// documento = CPF (com data de nascimento) ou CNPJ (com o número de uma matrícula
// que a empresa paga) — ver portalService.login.
export const loginPortalSchema = z.object({
  documento: z.string().trim().min(11, "CPF/CNPJ inválido").max(18, "CPF/CNPJ inválido"),
  dataNascimento: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data de nascimento inválida")
    .optional(),
  numeroMatricula: z.string().trim().max(50).optional(),
});

export const solicitarDocumentoSchema = z.object({
  tipoSolicitacaoId: z.string().uuid("Tipo de solicitação inválido"),
  matriculaId: z.string().uuid().nullable().optional(),
  observacao: z.string().trim().max(1000).nullable().optional(),
});

export const gerarCobrancaAlunoSchema = z.object({
  formaPagamento: z.enum(["BOLETO", "PIX", "CREDIT_CARD"]).optional(),
});

export const pagamentoCartaoPortalSchema = pagamentoCartaoSchema;

export type LoginPortalInput = z.infer<typeof loginPortalSchema>;
export type SolicitarDocumentoInput = z.infer<typeof solicitarDocumentoSchema>;
