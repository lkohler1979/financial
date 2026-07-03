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

/** Faz o parse e a validação estrutural de uma planilha .xlsx (PRD seção 11). */
export function parsePlanilhaImportacao(buffer: Buffer): ResultadoParse {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const nomeAba = workbook.SheetNames[0];
  if (!nomeAba) {
    throw new AppError("Planilha vazia ou em formato inválido", 422, "PLANILHA_INVALIDA");
  }

  const planilha = workbook.Sheets[nomeAba];
  const linhasBrutas = XLSX.utils.sheet_to_json<Record<string, unknown>>(planilha, {
    defval: undefined,
  });

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
