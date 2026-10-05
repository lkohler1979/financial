import { Prisma } from "@prisma/client";
import { prisma } from "../../database/prisma";

export const cuponsRepository = {
  list() {
    return prisma.cupom.findMany({ orderBy: [{ ativo: "desc" }, { codigo: "asc" }] });
  },

  findById(id: string) {
    return prisma.cupom.findUnique({ where: { id } });
  },

  findByCodigo(codigo: string) {
    return prisma.cupom.findUnique({ where: { codigo } });
  },

  create(data: Prisma.CupomCreateInput) {
    return prisma.cupom.create({ data });
  },

  update(id: string, data: Prisma.CupomUpdateInput) {
    return prisma.cupom.update({ where: { id }, data });
  },
};
