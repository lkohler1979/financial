import { prisma } from "../../database/prisma";

export const observacoesRepository = {
  listarPorMatricula(matriculaId: string) {
    return prisma.observacaoCobranca.findMany({
      where: { matriculaId },
      orderBy: { data: "desc" },
    });
  },

  criar(matriculaId: string, texto: string) {
    return prisma.observacaoCobranca.create({ data: { matriculaId, texto } });
  },
};
