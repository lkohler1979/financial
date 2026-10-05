import { z } from "zod";

const dadosTipo = {
  nome: z.string().trim().min(1, "Nome é obrigatório").max(100),
  obrigatorio: z.boolean(),
  usaValorDoCurso: z.boolean(),
  valorPadrao: z.coerce.number().positive("Valor deve ser maior que zero").nullable(),
  opcoesParcelas: z
    .array(z.coerce.number().int().min(1).max(360))
    .min(1, "Informe ao menos uma opção de parcelas"),
  prefixoTitulo: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{0,5}$/, "Use até 5 letras")
    .nullable(),
  ordem: z.coerce.number().int().min(0).max(999),
  ativo: z.boolean(),
  formaPagamentoPadrao: z.enum(["BOLETO", "PIX", "CREDIT_CARD"]).nullable(),
  aceitaCupom: z.boolean(),
  entraNoProtesto: z.boolean(),
  disponivelNoCadastro: z.boolean(),
  emissaoNaMatricula: z.enum(["TODAS", "PRIMEIRA", "SOB_DEMANDA"]),
};

export const criarTipoCobrancaSchema = z.object({
  ...dadosTipo,
  obrigatorio: dadosTipo.obrigatorio.default(false),
  usaValorDoCurso: dadosTipo.usaValorDoCurso.default(false),
  valorPadrao: dadosTipo.valorPadrao.optional(),
  prefixoTitulo: dadosTipo.prefixoTitulo.optional(),
  ordem: dadosTipo.ordem.default(0),
  ativo: dadosTipo.ativo.default(true),
  formaPagamentoPadrao: dadosTipo.formaPagamentoPadrao.optional(),
  aceitaCupom: dadosTipo.aceitaCupom.default(false),
  entraNoProtesto: dadosTipo.entraNoProtesto.default(true),
  disponivelNoCadastro: dadosTipo.disponivelNoCadastro.default(true),
  emissaoNaMatricula: dadosTipo.emissaoNaMatricula.default("PRIMEIRA"),
});

export const atualizarTipoCobrancaSchema = z
  .object(dadosTipo)
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, "Informe ao menos um campo para atualizar");

export const listarTiposCobrancaSchema = z.object({
  incluirInativos: z.coerce.boolean().default(false),
});

export type CriarTipoCobrancaInput = z.infer<typeof criarTipoCobrancaSchema>;
export type AtualizarTipoCobrancaInput = z.infer<typeof atualizarTipoCobrancaSchema>;
