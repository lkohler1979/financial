import { prisma } from "../../database/prisma";

export interface TrocaSituacao {
  situacaoAnterior: string | null;
  situacaoNova: string;
  periodoLetivo?: string | null;
  motivo?: string | null;
  observacoes?: string | null;
  /** Nulo = mudança automática do sistema. */
  usuarioId: string | null;
}

export const situacaoRepository = {
  findMatricula(id: string) {
    return prisma.matricula.findUnique({ where: { id }, select: { id: true, situacao: true } });
  },

  /** Troca a situação e grava o histórico na mesma transação. */
  trocar(matriculaId: string, dados: TrocaSituacao) {
    return prisma.$transaction([
      prisma.matricula.update({ where: { id: matriculaId }, data: { situacao: dados.situacaoNova } }),
      prisma.historicoSituacaoMatricula.create({ data: { matriculaId, ...dados } }),
    ]);
  },

  registrarInicial(matriculaId: string, situacaoNova: string, usuarioId: string | null) {
    return prisma.historicoSituacaoMatricula.create({
      data: { matriculaId, situacaoAnterior: null, situacaoNova, motivo: "Matrícula criada", usuarioId },
    });
  },

  listarHistorico(matriculaId: string) {
    return prisma.historicoSituacaoMatricula.findMany({
      where: { matriculaId },
      orderBy: { criadoEm: "desc" },
      include: { usuario: { select: { id: true, nome: true } } },
    });
  },
};
