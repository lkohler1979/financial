import { Prisma } from "@prisma/client";
import { prisma } from "../../database/prisma";

export interface ListarImportacoesParams {
  skip: number;
  take: number;
}

export const importacaoRepository = {
  findById(id: string) {
    return prisma.importacao.findUnique({ where: { id } });
  },

  async list({ skip, take }: ListarImportacoesParams) {
    const [data, total] = await Promise.all([
      prisma.importacao.findMany({ skip, take, orderBy: { data: "desc" } }),
      prisma.importacao.count(),
    ]);
    return { data, total };
  },

  create(data: Prisma.ImportacaoCreateInput) {
    return prisma.importacao.create({ data });
  },
};
