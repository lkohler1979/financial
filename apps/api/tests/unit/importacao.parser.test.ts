import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parsePlanilhaImportacao } from "../../src/modules/importacao/importacao.parser";

function bufferDaPlanilha(linhas: Record<string, unknown>[]): Buffer {
  const planilha = XLSX.utils.json_to_sheet(linhas);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, planilha, "Planilha1");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

const linhaValida = {
  DATA_MATRICULA: "01/02/2026",
  TP_PESSOA: "F",
  CNPJ_CPF: "39053344705",
  NOME: "Maria Silva",
  ENDEREÇO: "Rua A, 123",
  EMAIL: "maria@example.com",
  FONE: "11999999999",
  "CONTRATO ASSINADO": "Sim",
  COD_TITULO: "TIT-1",
  PARCELA: "1/3",
  DT_VENCIMENTO: "10/08/2026",
  VALOR: "150,00",
  TIPO_TITULO: "Mensalidade",
  CURSO: "Engenharia",
};

describe("parsePlanilhaImportacao", () => {
  it("faz o parse de linhas válidas", () => {
    const { validas, erros } = parsePlanilhaImportacao(bufferDaPlanilha([linhaValida]));

    expect(erros).toHaveLength(0);
    expect(validas).toHaveLength(1);
    expect(validas[0]).toMatchObject({ linha: 2, dados: { NOME: "Maria Silva", CURSO: "Engenharia" } });
  });

  it("reporta erro de linha para campos obrigatórios ausentes, mantendo o número da linha", () => {
    const linhaSemNome = { ...linhaValida, NOME: undefined };
    const { validas, erros } = parsePlanilhaImportacao(
      bufferDaPlanilha([linhaValida, linhaSemNome]),
    );

    expect(validas).toHaveLength(1);
    expect(erros).toHaveLength(1);
    expect(erros[0].linha).toBe(3);
  });

  it("retorna listas vazias quando a planilha não tem nenhuma linha de dados", () => {
    const { validas, erros } = parsePlanilhaImportacao(bufferDaPlanilha([]));

    expect(validas).toHaveLength(0);
    expect(erros).toHaveLength(0);
  });
});
