import { z } from "zod";

export const loginAlunoSchema = z.object({
  cpf: z.string().trim().min(11, "CPF inválido").max(14, "CPF inválido"),
  dataNascimento: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data de nascimento inválida"),
});

export const solicitarDocumentoSchema = z.object({
  tipoSolicitacaoId: z.string().uuid("Tipo de solicitação inválido"),
  matriculaId: z.string().uuid().nullable().optional(),
  observacao: z.string().trim().max(1000).nullable().optional(),
});

export const gerarCobrancaAlunoSchema = z.object({
  formaPagamento: z.enum(["BOLETO", "PIX", "CREDIT_CARD"]).optional(),
});

export type LoginAlunoInput = z.infer<typeof loginAlunoSchema>;
export type SolicitarDocumentoInput = z.infer<typeof solicitarDocumentoSchema>;
