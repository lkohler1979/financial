export type TabelaDestinoImportacao = "ALUNO" | "MATRICULA" | "PARCELA";
export type AcaoColunaAusente = "VALOR_PADRAO" | "NAO_IMPORTAR";

export interface MapeamentoImportacao {
  id: string;
  colunaPlanilha: string;
  tabelaDestino: TabelaDestinoImportacao;
  campoDestino: string;
  acaoAusente: AcaoColunaAusente;
  valorPadrao?: string | null;
  ativo: boolean;
}

export type CriarMapeamentoPayload = Omit<MapeamentoImportacao, "id">;
export type AtualizarMapeamentoPayload = Partial<CriarMapeamentoPayload>;

/** Campos configuráveis por tabela — retornado por GET /mapeamentos-importacao/campos. */
export type CamposDisponiveisPorTabela = Record<TabelaDestinoImportacao, Record<string, string>>;
