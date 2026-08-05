import { z } from "zod";

// Frase de confirmação exigida para limpar a base (pedido do usuário,
// 2026-07-08 — permitir zerar dados de teste antes de importar uma planilha
// real). Exige digitação exata para reduzir o risco de clique acidental numa
// ação irreversível.
export const FRASE_CONFIRMACAO_LIMPAR_BASE = "LIMPAR DADOS";

export const limparBaseSchema = z.object({
  confirmacao: z.string().refine((v) => v === FRASE_CONFIRMACAO_LIMPAR_BASE, {
    message: `Digite exatamente "${FRASE_CONFIRMACAO_LIMPAR_BASE}" para confirmar`,
  }),
});

export type LimparBaseInput = z.infer<typeof limparBaseSchema>;

export const atualizarConfiguracaoSchema = z
  .object({
    frequenciaImportacao: z.enum(["MANUAL", "SEMANAL", "MENSAL"]).optional(),
    diasAtraso: z.coerce.number().int().min(0).max(9999).optional(),
    pastaSaidaDocumentos: z.string().trim().min(1).max(500).optional(),
    modeloDocx: z.string().trim().min(1).max(500).optional(),
    padraoNomeArquivo: z.string().trim().min(1).max(200).optional(),
    multaPercentual: z.coerce.number().min(0).max(100).optional(),
    jurosDiarioPercentual: z.coerce.number().min(0).max(100).optional(),
    jurosContarDiaGeracao: z.boolean().optional(),
    tipoTituloProtestoDefault: z.enum(["MENSALIDADE", "RENEGOCIACAO", "AMBOS"]).optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, "Informe ao menos um campo para atualizar");

export type AtualizarConfiguracaoInput = z.infer<typeof atualizarConfiguracaoSchema>;
