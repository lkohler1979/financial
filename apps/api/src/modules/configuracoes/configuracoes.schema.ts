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
    legadoSincronizacaoAtiva: z.boolean().optional(),
    legadoUrl: z.string().trim().url().max(300).optional(),
    legadoUsuario: z.string().trim().min(1).max(200).optional(),
    // Senha em texto puro, só nesta entrada — o service criptografa antes de
    // persistir e nunca a devolve (nem criptografada) nas respostas.
    legadoSenha: z.string().min(1).max(200).optional(),
    legadoIntervaloHoras: z.coerce.number().int().min(1).max(720).optional(),
    asaasAmbiente: z.enum(["SANDBOX", "PRODUCAO"]).optional(),
    // API key/token em texto puro, só nesta entrada — o service criptografa
    // antes de persistir e nunca os devolve (mesmo padrão de legadoSenha).
    asaasApiKey: z.string().min(1).max(300).optional(),
    asaasWebhookToken: z.string().min(1).max(300).optional(),
    // Qual provedor atende cada tipo de cobrança no menu "Gerar cobrança" —
    // null desabilita o tipo. Nunca os dois provedores no mesmo tipo (por
    // isso é um valor único, não uma lista). Boleto só aceita ASAAS (a Rede não
    // tem boleto). Cartão pela Rede é pago num formulário do Ethos que envia o
    // cartão à API da Rede (sem gravá-lo) — escopo PCI aceito pelo usuário em 2026-10-06.
    provedorBoleto: z.enum(["ASAAS"]).nullable().optional(),
    provedorPix: z.enum(["ASAAS", "REDE"]).nullable().optional(),
    provedorCartao: z.enum(["ASAAS", "REDE"]).nullable().optional(),
    redeCartaoMaxParcelas: z.coerce.number().int().min(1).max(12).optional(),
    // NFS-e (emissão pelo Asaas): ver nfse.service.ts.
    nfseAtiva: z.boolean().optional(),
    nfseDiaLimite: z.coerce.number().int().min(1).max(28).optional(),
    nfseServicoCodigo: z.string().trim().min(1).max(20).optional(),
    nfseServicoNome: z.string().trim().min(1).max(200).optional(),
    nfseServicoDescricao: z.string().trim().min(1).max(500).optional(),
    nfseMunicipalServiceId: z.string().trim().max(100).nullable().optional(),
    nfseIssPercentual: z.coerce.number().min(0).max(5).optional(),
    // Emissão direta no Portal Nacional (o certificado A1 vai por PUT /api/nfse/certificado).
    nfseProvedor: z.enum(["ASAAS", "NACIONAL"]).optional(),
    nfseAmbiente: z.enum(["HOMOLOGACAO", "PRODUCAO"]).optional(),
    nfsePrestadorCnpj: z
      .string()
      .trim()
      .transform((v) => v.replace(/\D/g, ""))
      .refine((v) => v === "" || v.length === 14, "CNPJ deve ter 14 dígitos")
      .nullable()
      .optional(),
    nfsePrestadorInscricaoMunicipal: z.string().trim().max(15).nullable().optional(),
    nfsePrestadorTelefone: z.string().trim().max(30).nullable().optional(),
    nfsePrestadorEmail: z.string().trim().email().max(80).nullable().optional(),
    nfseMunicipioIbge: z
      .string()
      .trim()
      .regex(/^\d{7}$/, "Código IBGE deve ter 7 dígitos")
      .nullable()
      .optional(),
    nfseOpcaoSimples: z.coerce.number().int().min(1).max(3).optional(),
    nfseRegimeApuracaoSn: z.coerce.number().int().min(1).max(3).optional(),
    nfseRegimeEspecial: z.coerce.number().int().min(0).max(6).optional(),
    nfseAliquotaSimples: z.coerce.number().min(0).max(100).optional(),
    nfseCodigoTributacaoMunicipal: z.string().trim().max(3).nullable().optional(),
    nfseSerieDps: z.coerce.number().int().min(1).max(89999).optional(),
    nfseProximoNumeroDps: z.coerce.number().int().min(1).max(999999999999999).optional(),
    redeAmbiente: z.enum(["SANDBOX", "PRODUCAO"]).optional(),
    // PV/chave de integração/token em texto puro, só nesta entrada — o
    // service criptografa antes de persistir e nunca os devolve (mesmo
    // padrão de legadoSenha/asaasApiKey).
    redePv: z.string().trim().min(1).max(100).optional(),
    redeChaveIntegracao: z.string().min(1).max(300).optional(),
    redeWebhookToken: z.string().min(1).max(300).optional(),
    // Multa/juros/desconto enviados em toda cobrança gerada no Asaas — null
    // limpa (deixa de enviar o campo), undefined mantém o que já tem salvo.
    asaasMultaPercentual: z.coerce.number().min(0).max(100).nullable().optional(),
    asaasJurosMensalPercentual: z.coerce.number().min(0).max(100).nullable().optional(),
    asaasDescontoPercentual: z.coerce.number().min(0).max(100).nullable().optional(),
    asaasDescontoDiasAntesVencimento: z.coerce.number().int().min(0).max(30).nullable().optional(),
    emissaoAntecipadaDias: z.coerce.number().int().min(0).max(60).optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, "Informe ao menos um campo para atualizar");

export type AtualizarConfiguracaoInput = z.infer<typeof atualizarConfiguracaoSchema>;
