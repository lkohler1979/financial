export type FrequenciaImportacao = "MANUAL" | "SEMANAL" | "MENSAL";

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
}

export type AtualizarConfiguracaoPayload = Omit<Configuracao, "id">;

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
