import type {
  ImportacaoLegadoLote,
  ImportacaoLegadoOcorrencia,
  TipoOcorrenciaLote,
} from "@prisma/client";
import * as XLSX from "xlsx";
import { formatarCpf } from "../../shared/utils/cpf";

/** Uma aba por tipo de ocorrência, na ordem em que a equipe costuma analisar. */
const ABAS: { tipo: TipoOcorrenciaLote; aba: string }[] = [
  { tipo: "ALUNO_SEM_CPF", aba: "Alunos sem CPF" },
  { tipo: "MATRICULA_NAO_REALIZADA", aba: "Matrículas não realizadas" },
  { tipo: "PARCELA_NAO_IMPORTADA", aba: "Parcelas não importadas" },
  { tipo: "CURSO_CRIADO", aba: "Cursos criados" },
  { tipo: "ALUNO_SEM_MATRICULA", aba: "Alunos sem matrícula" },
  { tipo: "ERRO", aba: "Erros" },
  { tipo: "VARREDURA_INCOMPLETA", aba: "Varredura incompleta" },
];

const dataHora = (d: Date | null) =>
  d ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";

function linhaDe(o: ImportacaoLegadoOcorrencia) {
  return {
    Pessoa: o.pessoaNome ?? "",
    CPF: o.cpf && o.cpf.replace(/\D/g, "").length === 11 ? formatarCpf(o.cpf) : (o.cpf ?? ""),
    "ID no legado": o.pesId ?? "",
    Curso: o.curso ?? "",
    Título: o.titulo ?? "",
    Motivo: o.motivo,
  };
}

/** Planilha (.xlsx) com o resumo do lote e uma aba por tipo de ocorrência. */
export function montarRelatorioLote(
  lote: ImportacaoLegadoLote,
  ocorrencias: ImportacaoLegadoOcorrencia[],
): Buffer {
  const livro = XLSX.utils.book_new();

  const resumo: (string | number)[][] = [
    ["Importação em lote do legado", ""],
    ["Situação", lote.status],
    ["Iniciada em", dataHora(lote.criadoEm)],
    ["Finalizada em", dataHora(lote.finalizadoEm)],
    ["", ""],
    ["Pessoas encontradas no legado", lote.pessoasEncontradas],
    ["Pessoas processadas", lote.pessoasProcessadas],
    ["Alunos criados", lote.alunosCriados],
    ["Matrículas criadas", lote.matriculasNovas],
    ["Cursos criados", lote.cursosCriados],
    ["Parcelas criadas", lote.parcelasNovas],
    ["Parcelas atualizadas", lote.parcelasAtualizadas],
    ["", ""],
    ["Pessoas sem CPF", lote.semCpf],
    ["Pessoas com erro", lote.erros],
  ];
  if (lote.mensagemFalha) resumo.push(["Falha", lote.mensagemFalha]);
  resumo.push(["", ""], ["Ocorrências por tipo", ""]);
  for (const { tipo, aba } of ABAS) {
    resumo.push([aba, ocorrencias.filter((o) => o.tipo === tipo).length]);
  }
  const abaResumo = XLSX.utils.aoa_to_sheet(resumo);
  abaResumo["!cols"] = [{ wch: 34 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(livro, abaResumo, "Resumo");

  for (const { tipo, aba } of ABAS) {
    const linhas = ocorrencias.filter((o) => o.tipo === tipo).map(linhaDe);
    if (linhas.length === 0) continue;
    const planilha = XLSX.utils.json_to_sheet(linhas);
    planilha["!cols"] = [
      { wch: 36 },
      { wch: 16 },
      { wch: 12 },
      { wch: 40 },
      { wch: 44 },
      { wch: 70 },
    ];
    XLSX.utils.book_append_sheet(livro, planilha, aba);
  }

  return XLSX.write(livro, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
