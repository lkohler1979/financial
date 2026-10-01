export type FrequenciaImportacao = "MANUAL" | "SEMANAL" | "MENSAL";

export type TipoTituloProtesto = "MENSALIDADE" | "RENEGOCIACAO" | "AMBOS";

export type AsaasAmbiente = "SANDBOX" | "PRODUCAO";

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
}

export type AtualizarConfiguracaoPayload = Omit<
  Configuracao,
  "id" | "legadoSenhaConfigurada" | "asaasApiKeyConfigurada" | "asaasWebhookTokenConfigurado"
> & {
  /** Só enviado quando o admin digita uma nova senha — deixe undefined para manter a atual. */
  legadoSenha?: string;
  /** Só enviado quando o admin digita uma nova chave — deixe undefined para manter a atual. */
  asaasApiKey?: string;
  /** Só enviado quando o admin digita um novo token — deixe undefined para manter o atual. */
  asaasWebhookToken?: string;
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
