export type SituacaoDocumentacao =
  "SEM_DOCUMENTOS" | "DOCUMENTOS_PENDENTES" | "DOCUMENTACAO_COMPLETA";

export interface TipoParaSituacao {
  id: string;
  escopo: "ALUNO" | "MATRICULA";
  obrigatorio: boolean;
}

export interface DocumentoParaSituacao {
  tipoDocumentoId: string;
  /** Nulo nos documentos do aluno (valem para todas as matrículas dele). */
  matriculaId: string | null;
  situacaoEntrega: "NAO_ENVIADO" | "ENVIADO";
  situacaoDeferimento: "PENDENTE" | "DEFERIDO" | "INDEFERIDO";
}

/**
 * Situação da documentação de uma matrícula:
 *  - SEM_DOCUMENTOS: nenhum documento enviado (da matrícula ou do aluno);
 *  - DOCUMENTOS_PENDENTES: falta algum documento obrigatório (não enviado ou ainda não deferido)
 *    ou há algum documento enviado indeferido;
 *  - DOCUMENTACAO_COMPLETA: todos os obrigatórios enviados e deferidos, sem nenhum indeferido.
 * `tipos` são os tipos ATIVOS; `documentos` são os do aluno (todas as matrículas dele).
 */
export function calcularSituacaoDocumentacao(
  matriculaId: string,
  tipos: TipoParaSituacao[],
  documentos: DocumentoParaSituacao[],
): SituacaoDocumentacao {
  const tipoPorId = new Map(tipos.map((t) => [t.id, t]));
  // Documento da matrícula conta para tipos de matrícula; o do aluno, para tipos de aluno.
  const daMatricula = documentos.filter((d) => {
    const escopo = tipoPorId.get(d.tipoDocumentoId)?.escopo;
    if (escopo === "MATRICULA") return d.matriculaId === matriculaId;
    if (escopo === "ALUNO") return d.matriculaId === null;
    return false;
  });
  const enviados = daMatricula.filter((d) => d.situacaoEntrega === "ENVIADO");
  if (enviados.length === 0) return "SEM_DOCUMENTOS";

  if (enviados.some((d) => d.situacaoDeferimento === "INDEFERIDO")) return "DOCUMENTOS_PENDENTES";

  const faltaObrigatorio = tipos.some(
    (t) =>
      t.obrigatorio &&
      !enviados.some((d) => d.tipoDocumentoId === t.id && d.situacaoDeferimento === "DEFERIDO"),
  );
  return faltaObrigatorio ? "DOCUMENTOS_PENDENTES" : "DOCUMENTACAO_COMPLETA";
}
