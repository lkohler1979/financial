import { Prisma } from "@prisma/client";
import { prisma } from "../../database/prisma";

export const situacoesRepository = {
  findById(id: string) {
    return prisma.situacaoCobranca.findUnique({ where: { id } });
  },

  findByNome(nome: string) {
    return prisma.situacaoCobranca.findUnique({ where: { nome } });
  },

  list(ativa?: boolean) {
    return prisma.situacaoCobranca.findMany({
      where: ativa !== undefined ? { ativa } : {},
      orderBy: { ordem: "asc" },
    });
  },

  create(data: Prisma.SituacaoCobrancaCreateInput) {
    return prisma.situacaoCobranca.create({ data });
  },

  update(id: string, data: Prisma.SituacaoCobrancaUpdateInput) {
    return prisma.situacaoCobranca.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.situacaoCobranca.delete({ where: { id } });
  },

  countMatriculas(situacaoId: string) {
    return prisma.matricula.count({ where: { situacaoCobrancaId: situacaoId } });
  },
};
