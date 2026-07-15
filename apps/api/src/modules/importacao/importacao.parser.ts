import * as XLSX from "xlsx";
import { AppError } from "../../shared/errors/app-error";
import { linhaPlanilhaSchema, LinhaPlanilha } from "./importacao.schema";

export interface LinhaImportacaoValida {
  /** Número da linha na planilha (cabeçalho = linha 1, primeira linha de dados = 2). */
  linha: number;
  dados: LinhaPlanilha;
}

export interface ErroImportacao {
  linha: number;
  mensagem: string;
}

export interface ResultadoParse {
  validas: LinhaImportacaoValida[];
  erros: ErroImportacao[];
}

const ESPACO_NAO_SEPARAVEL = String.fromCharCode(160);

/**
 * Normaliza o nome de uma coluna do cabeçalho: troca espaço não separável
 * (comum em planilhas exportadas de outros sistemas) por espaço comum e
 * remove espaços nas pontas. Planilhas reais às vezes trazem cabeçalhos com
 * um espaço a mais (ex.: "CURSO " em vez de "CURSO"), o que faria o
 * casamento exato do Zod falhar silenciosamente para a linha inteira.
 */
function normalizarNomeColuna(nome: string): string {
  return nome.split(ESPACO_NAO_SEPARAVEL).join(" ").trim();
}

// Colunas estruturais que já foram vistas com nomes alternativos em
// planilhas reais de diferentes sistemas de origem (ver docs/PENDENCIAS.md).
// A primeira variante encontrada na linha é copiada para o nome esperado
// pelo schema (linhaPlanilhaSchema) — CURSO é estrutural, não passa por
// MapeamentoImportacao, então o alias precisa ficar aqui.
const ALIASES_COLUNAS_ESTRUTURAIS: Record<string, string[]> = {
  CURSO: ["NOME_CURSO"],
};

function aplicarAliasesEstruturais(linha: Record<string, unknown>): void {
  for (const [colunaEsperada, alternativas] of Object.entries(ALIASES_COLUNAS_ESTRUTURAIS)) {
    if (linha[colunaEsperada] !== undefined) continue;
    const alternativaEncontrada = alternativas.find((nome) => linha[nome] !== undefined);
    if (alternativaEncontrada) linha[colunaEsperada] = linha[alternativaEncontrada];
  }
}

function normalizarChavesLinha(linha: Record<string, unknown>): Record<string, unknown> {
  const normalizada: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(linha)) {
    normalizada[normalizarNomeColuna(chave)] = valor;
  }
  aplicarAliasesEstruturais(normalizada);
  return normalizada;
}

/** Faz o parse e a validação estrutural de uma planilha .xlsx (PRD seção 11). */
export function parsePlanilhaImportacao(buffer: Buffer): ResultadoParse {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const nomeAba = workbook.SheetNames[0];
  if (!nomeAba) {
    throw new AppError("Planilha vazia ou em formato inválido", 422, "PLANILHA_INVALIDA");
  }

  const planilha = workbook.Sheets[nomeAba];
  const linhasBrutas = XLSX.utils
    .sheet_to_json<Record<string, unknown>>(planilha, { defval: undefined })
    .map(normalizarChavesLinha);

  const validas: LinhaImportacaoValida[] = [];
  const erros: ErroImportacao[] = [];

  linhasBrutas.forEach((linhaBruta, indice) => {
    const numeroLinha = indice + 2; // +1 (1-index) +1 (linha de cabeçalho)
    const resultado = linhaPlanilhaSchema.safeParse(linhaBruta);
    if (!resultado.success) {
      const mensagem = resultado.error.issues
        .map((i) => `${i.path.join(".") || "linha"}: ${i.message}`)
        .join("; ");
      erros.push({ linha: numeroLinha, mensagem });
      return;
    }
    validas.push({ linha: numeroLinha, dados: resultado.data });
  });

  return { validas, erros };
}
