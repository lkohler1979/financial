import { Prisma } from "@prisma/client";
import { prisma } from "../../database/prisma";

export const tiposCobrancaRepository = {
  list(incluirInativos: boolean) {
    return prisma.tipoCobranca.findMany({
      where: incluirInativos ? {} : { ativo: true },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    });
  },

  findById(id: string) {
    return prisma.tipoCobranca.findUnique({ where: { id } });
  },

  findByNome(nome: string) {
    return prisma.tipoCobranca.findUnique({ where: { nome } });
  },

  findManyByIds(ids: string[]) {
    return prisma.tipoCobranca.findMany({ where: { id: { in: ids } } });
  },

  listObrigatoriosAtivos() {
    return prisma.tipoCobranca.findMany({ where: { obrigatorio: true, ativo: true } });
  },

  create(data: Prisma.TipoCobrancaCreateInput) {
    return prisma.tipoCobranca.create({ data });
  },

  update(id: string, data: Prisma.TipoCobrancaUpdateInput) {
    return prisma.tipoCobranca.update({ where: { id }, data });
  },
};
