import type { ImportacaoDocumentosItem, ImportacaoDocumentosLote } from "@prisma/client";
import * as XLSX from "xlsx";
import { formatarCpf } from "../../shared/utils/cpf";

const dataHora = (d: Date | null) =>
  d ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";

const SITUACAO_ITEM = { PENDENTE: "Não processado", CONCLUIDO: "Processado", ERRO: "Com erro" };

/** Planilha (.xlsx) com o resumo da busca e o resultado de cada aluno. */
export function montarRelatorioDocumentos(
  lote: ImportacaoDocumentosLote,
  itens: ImportacaoDocumentosItem[],
): Buffer {
  const livro = XLSX.utils.book_new();

  const resumo: (string | number)[][] = [
    ["Busca de documentos no legado (em lote)", ""],
    ["Situação", lote.status],
    ["Iniciada em", dataHora(lote.criadoEm)],
    ["Finalizada em", dataHora(lote.finalizadoEm)],
    ["", ""],
    ["Alunos na busca", lote.total],
    ["Alunos processados", lote.processados],
    ["Alunos com erro", lote.alunosComErro],
    ["", ""],
    ["Documentos baixados", lote.baixados],
    ["Documentos já importados antes", lote.jaImportados],
    ["Mantidos (já havia outro arquivo)", lote.mantidos],
    ["Tipos sem documento no legado", lote.semDocumento],
    ["Erros em documentos", lote.errosDocumentos],
  ];
  if (lote.mensagemFalha) resumo.push(["", ""], ["Falha", lote.mensagemFalha]);
  XLSX.utils.book_append_sheet(livro, XLSX.utils.aoa_to_sheet(resumo), "Resumo");

  const linhas = itens.map((i) => ({
    Aluno: i.alunoNome,
    CPF: i.cpf.replace(/\D/g, "").length === 11 ? formatarCpf(i.cpf) : i.cpf,
    Situação: SITUACAO_ITEM[i.resultado],
    Baixados: i.baixados,
    "Já importados": i.jaImportados,
    Mantidos: i.mantidos,
    "Sem documento": i.semDocumento,
    Erros: i.erros,
    Observação: i.mensagem ?? "",
  }));
  XLSX.utils.book_append_sheet(
    livro,
    XLSX.utils.json_to_sheet(linhas.length ? linhas : [{ Aluno: "(nenhum aluno)" }]),
    "Alunos",
  );

  return XLSX.write(livro, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
