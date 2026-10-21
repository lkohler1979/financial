import { SituacaoDocumentacao } from "@prisma/client";
import { prisma } from "../../database/prisma";

export const documentacaoRepository = {
  tiposAtivos() {
    return prisma.tipoDocumento.findMany({
      where: { ativo: true },
      select: { id: true, escopo: true, obrigatorio: true },
    });
  },

  /** Matrículas (com o aluno) cuja situação de documentação precisa ser conferida. */
  matriculas(filtro: { matriculaId?: string; alunoId?: string }) {
    return prisma.matricula.findMany({
      where: {
        ...(filtro.matriculaId ? { id: filtro.matriculaId } : {}),
        ...(filtro.alunoId ? { alunoId: filtro.alunoId } : {}),
      },
      select: { id: true, alunoId: true, situacaoDocumentacao: true },
    });
  },

  /** Documentos (só os campos que contam para a situação) dos alunos informados, ou de todos. */
  documentos(alunoIds?: string[]) {
    return prisma.documento.findMany({
      where: {
        situacaoEntrega: "ENVIADO",
        ...(alunoIds ? { alunoId: { in: alunoIds } } : {}),
      },
      select: {
        alunoId: true,
        tipoDocumentoId: true,
        matriculaId: true,
        situacaoEntrega: true,
        situacaoDeferimento: true,
      },
    });
  },

  /** Grava a nova situação em um grupo de matrículas de uma vez. */
  definirSituacao(ids: string[], situacao: SituacaoDocumentacao) {
    if (ids.length === 0) return Promise.resolve({ count: 0 });
    return prisma.matricula.updateMany({
      where: { id: { in: ids } },
      data: { situacaoDocumentacao: situacao },
    });
  },
};
