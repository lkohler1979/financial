import type { SituacaoDocumentacao } from "@prisma/client";
import { documentacaoRepository } from "./documentacao.repository";
import { calcularSituacaoDocumentacao } from "./situacao-documentacao";

/**
 * Mantém `Matricula.situacaoDocumentacao` em dia. Chamado sempre que um documento muda (envio,
 * conferência, remoção, importação do legado) ou quando os tipos de documento mudam.
 */
async function recalcular(filtro: { matriculaId?: string; alunoId?: string }) {
  const matriculas = await documentacaoRepository.matriculas(filtro);
  if (matriculas.length === 0) return { conferidas: 0, alteradas: 0 };

  const alunoIds =
    filtro.matriculaId || filtro.alunoId
      ? [...new Set(matriculas.map((m) => m.alunoId))]
      : undefined;
  const [tipos, documentos] = await Promise.all([
    documentacaoRepository.tiposAtivos(),
    documentacaoRepository.documentos(alunoIds),
  ]);

  const porAluno = new Map<string, typeof documentos>();
  for (const d of documentos) {
    const lista = porAluno.get(d.alunoId);
    if (lista) lista.push(d);
    else porAluno.set(d.alunoId, [d]);
  }

  // Só grava o que mudou, agrupado por situação (poucas consultas, mesmo com milhares de matrículas).
  const mudancas: Record<SituacaoDocumentacao, string[]> = {
    SEM_DOCUMENTOS: [],
    DOCUMENTOS_PENDENTES: [],
    DOCUMENTACAO_COMPLETA: [],
  };
  let alteradas = 0;
  for (const m of matriculas) {
    const nova = calcularSituacaoDocumentacao(m.id, tipos, porAluno.get(m.alunoId) ?? []);
    if (nova !== m.situacaoDocumentacao) {
      mudancas[nova].push(m.id);
      alteradas++;
    }
  }
  for (const [situacao, ids] of Object.entries(mudancas)) {
    // Em blocos, para não estourar o limite de parâmetros de uma consulta.
    for (let i = 0; i < ids.length; i += 5000) {
      await documentacaoRepository.definirSituacao(
        ids.slice(i, i + 5000),
        situacao as SituacaoDocumentacao,
      );
    }
  }
  return { conferidas: matriculas.length, alteradas };
}

export const documentacaoService = {
  recalcularMatricula: (matriculaId: string) => recalcular({ matriculaId }),
  /** Documentos do aluno valem para todas as matrículas dele. */
  recalcularAluno: (alunoId: string) => recalcular({ alunoId }),
  /** Quando os tipos (obrigatoriedade/ativo) mudam, qualquer matrícula pode mudar de situação. */
  recalcularTodas: () => recalcular({}),
};
