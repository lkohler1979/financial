import { prisma } from "../../database/prisma";

export const historicoRepository = {
  listarPorMatricula(matriculaId: string) {
    return prisma.historicoCobranca.findMany({
      where: { matriculaId },
      orderBy: { data: "desc" },
      include: { usuario: { select: { id: true, nome: true } } },
    });
  },

  /** Registro imutável — nunca é editado/apagado (CLAUDE.md seção 4). */
  registrar(matriculaId: string, usuarioId: string, acao: string) {
    return prisma.historicoCobranca.create({ data: { matriculaId, usuarioId, acao } });
  },
};
