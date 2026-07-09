import { TabelaDestinoImportacao } from "@prisma/client";

// Campos "complementares" configuráveis por tabela — os campos estruturais da
// importação (CNPJ_CPF, NOME, COD_TITULO, PARCELA, DT_VENCIMENTO, VALOR,
// CURSO) ficam de fora porque a lógica de localizar/criar os registros
// depende deles diretamente (ver importacao.processor.ts).
export const TIPO_CAMPO = {
  texto: "texto",
  data: "data",
  booleano: "booleano",
  numero: "numero",
} as const;

export type TipoCampo = (typeof TIPO_CAMPO)[keyof typeof TIPO_CAMPO];

export const CAMPOS_POR_TABELA: Record<
  TabelaDestinoImportacao,
  Record<string, TipoCampo>
> = {
  ALUNO: {
    tipoPessoa: TIPO_CAMPO.texto,
    email: TIPO_CAMPO.texto,
    telefone1: TIPO_CAMPO.texto,
    telefone2: TIPO_CAMPO.texto,
    cep: TIPO_CAMPO.texto,
    endereco: TIPO_CAMPO.texto,
    numero: TIPO_CAMPO.texto,
    complemento: TIPO_CAMPO.texto,
    bairro: TIPO_CAMPO.texto,
    cidade: TIPO_CAMPO.texto,
    estado: TIPO_CAMPO.texto,
  },
  MATRICULA: {
    dataMatricula: TIPO_CAMPO.data,
    contratoAssinado: TIPO_CAMPO.booleano,
    numeroMatricula: TIPO_CAMPO.texto,
    observacoes: TIPO_CAMPO.texto,
  },
  PARCELA: {
    tipoTitulo: TIPO_CAMPO.texto,
    observacoes: TIPO_CAMPO.texto,
    /// Valor com juros/multa já calculado pelo sistema de origem — só para
    /// referência/conferência, não substitui o cálculo próprio (ver
    /// docs/PENDENCIAS.md).
    valorOrigemComJurosEMulta: TIPO_CAMPO.numero,
  },
};

export function tipoDoCampo(
  tabela: TabelaDestinoImportacao,
  campo: string,
): TipoCampo | undefined {
  return CAMPOS_POR_TABELA[tabela]?.[campo];
}

export function campoValido(tabela: TabelaDestinoImportacao, campo: string): boolean {
  return tipoDoCampo(tabela, campo) !== undefined;
}

// Planilha já importada (ver docs/PRD.md seção 11) usada como configuração
// padrão na primeira execução — preserva o comportamento atual até que o
// usuário ajuste o mapeamento na tela de Configurações.
export const MAPEAMENTOS_PADRAO: Array<{
  colunaPlanilha: string;
  tabelaDestino: TabelaDestinoImportacao;
  campoDestino: string;
  acaoAusente: "VALOR_PADRAO" | "NAO_IMPORTAR";
  valorPadrao?: string;
}> = [
  { colunaPlanilha: "TP_PESSOA", tabelaDestino: "ALUNO", campoDestino: "tipoPessoa", acaoAusente: "NAO_IMPORTAR" },
  { colunaPlanilha: "EMAIL", tabelaDestino: "ALUNO", campoDestino: "email", acaoAusente: "NAO_IMPORTAR" },
  { colunaPlanilha: "FONE_1", tabelaDestino: "ALUNO", campoDestino: "telefone1", acaoAusente: "NAO_IMPORTAR" },
  { colunaPlanilha: "FONE_2", tabelaDestino: "ALUNO", campoDestino: "telefone2", acaoAusente: "NAO_IMPORTAR" },
  { colunaPlanilha: "CEP", tabelaDestino: "ALUNO", campoDestino: "cep", acaoAusente: "NAO_IMPORTAR" },
  { colunaPlanilha: "ENDERECO", tabelaDestino: "ALUNO", campoDestino: "endereco", acaoAusente: "NAO_IMPORTAR" },
  { colunaPlanilha: "NUMERO", tabelaDestino: "ALUNO", campoDestino: "numero", acaoAusente: "NAO_IMPORTAR" },
  { colunaPlanilha: "COMPLEMENTO", tabelaDestino: "ALUNO", campoDestino: "complemento", acaoAusente: "NAO_IMPORTAR" },
  { colunaPlanilha: "BAIRRO", tabelaDestino: "ALUNO", campoDestino: "bairro", acaoAusente: "NAO_IMPORTAR" },
  { colunaPlanilha: "CIDADE", tabelaDestino: "ALUNO", campoDestino: "cidade", acaoAusente: "NAO_IMPORTAR" },
  { colunaPlanilha: "ESTADO", tabelaDestino: "ALUNO", campoDestino: "estado", acaoAusente: "NAO_IMPORTAR" },
  { colunaPlanilha: "DATA_MATRICULA", tabelaDestino: "MATRICULA", campoDestino: "dataMatricula", acaoAusente: "NAO_IMPORTAR" },
  {
    // Planilha real recebida em 2026-07-09 traz a coluna com "?" no nome
    // ("CONTRATO ASSINADO?") — corrigido para bater exatamente (o casamento
    // é por nome literal da coluna, ver resolverCamposDinamicos).
    colunaPlanilha: "CONTRATO ASSINADO?",
    tabelaDestino: "MATRICULA",
    campoDestino: "contratoAssinado",
    acaoAusente: "VALOR_PADRAO",
    valorPadrao: "false",
  },
  { colunaPlanilha: "TIPO_TITULO", tabelaDestino: "PARCELA", campoDestino: "tipoTitulo", acaoAusente: "NAO_IMPORTAR" },
  {
    colunaPlanilha: "TITULO_VALOR_JUROS_E_MULTA",
    tabelaDestino: "PARCELA",
    campoDestino: "valorOrigemComJurosEMulta",
    acaoAusente: "NAO_IMPORTAR",
  },
];
