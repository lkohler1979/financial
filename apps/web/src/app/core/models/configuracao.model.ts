export type FrequenciaImportacao = "MANUAL" | "SEMANAL" | "MENSAL";

export type TipoTituloProtesto = "MENSALIDADE" | "RENEGOCIACAO" | "AMBOS";

export type AsaasAmbiente = "SANDBOX" | "PRODUCAO";

export type AsaasBillingType = "BOLETO" | "PIX" | "CREDIT_CARD";

/** Quem processa a cobrança — cada tipo (Boleto/Pix/Cartão) só pode ter UM
 * provedor por vez (nunca os dois ao mesmo tempo para o mesmo tipo). */
export type PagamentoProvedor = "ASAAS" | "REDE";

export type RedeAmbiente = "SANDBOX" | "PRODUCAO";

export interface Configuracao {
  id: string;
  frequenciaImportacao: FrequenciaImportacao;
  diasAtraso: number;
  pastaSaidaDocumentos: string;
  modeloDocx: string;
  padraoNomeArquivo: string;
  multaPercentual: number;
  jurosDiarioPercentual: number;
  jurosContarDiaGeracao: boolean;
  tipoTituloProtestoDefault: TipoTituloProtesto;
  legadoSincronizacaoAtiva: boolean;
  legadoUrl: string | null;
  legadoUsuario: string | null;
  /** Nunca vem a senha em si — só se já foi configurada (a API nunca a retorna). */
  legadoSenhaConfigurada: boolean;
  legadoIntervaloHoras: number;
  asaasAmbiente: AsaasAmbiente;
  /** Nunca vem a chave em si — só se já foi configurada (a API nunca a retorna). */
  asaasApiKeyConfigurada: boolean;
  /** Nunca vem o token em si — só se já foi configurado (a API nunca o retorna). */
  asaasWebhookTokenConfigurado: boolean;
  /** Qual provedor atende cada tipo no menu "Gerar cobrança" — null
   * desabilita o tipo. Boleto e Cartão só aceitam ASAAS (Rede não tem
   * Boleto, e Cartão via Rede não está implementado). */
  provedorBoleto: PagamentoProvedor | null;
  provedorPix: PagamentoProvedor | null;
  provedorCartao: PagamentoProvedor | null;
  redeAmbiente: RedeAmbiente;
  /** Nunca vem o PV em si — só se já foi configurado. */
  redePvConfigurado: boolean;
  /** Nunca vem a chave em si — só se já foi configurada. */
  redeChaveIntegracaoConfigurada: boolean;
  /** Nunca vem o token em si — só se já foi configurado. */
  redeWebhookTokenConfigurado: boolean;
  /** Multa/juros/desconto enviados em toda cobrança gerada no Asaas — null
   * quando não configurado (o Asaas não recebe o campo nesse caso). */
  asaasMultaPercentual: number | null;
  /** Sempre % AO MÊS — é assim que o Asaas interpreta, não ao dia. */
  asaasJurosMensalPercentual: number | null;
  asaasDescontoPercentual: number | null;
  /** Dias ANTES do vencimento em que o desconto acima ainda vale (0 = só até
   * o dia do vencimento). Só tem efeito com asaasDescontoPercentual preenchido. */
  asaasDescontoDiasAntesVencimento: number | null;
}

export type AtualizarConfiguracaoPayload = Omit<
  Configuracao,
  | "id"
  | "legadoSenhaConfigurada"
  | "asaasApiKeyConfigurada"
  | "asaasWebhookTokenConfigurado"
  | "redePvConfigurado"
  | "redeChaveIntegracaoConfigurada"
  | "redeWebhookTokenConfigurado"
> & {
  /** Só enviado quando o admin digita uma nova senha — deixe undefined para manter a atual. */
  legadoSenha?: string;
  /** Só enviado quando o admin digita uma nova chave — deixe undefined para manter a atual. */
  asaasApiKey?: string;
  /** Só enviado quando o admin digita um novo token — deixe undefined para manter o atual. */
  asaasWebhookToken?: string;
  /** Só enviado quando o admin digita um novo PV — deixe undefined para manter o atual. */
  redePv?: string;
  /** Só enviado quando o admin digita uma nova chave — deixe undefined para manter a atual. */
  redeChaveIntegracao?: string;
  /** Só enviado quando o admin digita um novo token — deixe undefined para manter o atual. */
  redeWebhookToken?: string;
};

/** Frase que precisa ser digitada exatamente para confirmar a limpeza da base (backend valida). */
export const FRASE_CONFIRMACAO_LIMPAR_BASE = "LIMPAR DADOS";

export interface ContagensLimpezaBase {
  historicoCobranca: number;
  observacoesCobranca: number;
  matriculaTags: number;
  parcelas: number;
  matriculas: number;
  relatoriosInadimplencia: number;
  importacoes: number;
  alunos: number;
  cursos: number;
}
