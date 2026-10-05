import { Prisma } from "@prisma/client";
import { prisma } from "../../database/prisma";

export const sacadosRepository = {
  findById(id: string) {
    return prisma.sacado.findUnique({ where: { id } });
  },

  findByCpfCnpj(cpfCnpj: string) {
    return prisma.sacado.findUnique({ where: { cpfCnpj } });
  },

  buscar(busca?: string) {
    const digitos = busca?.replace(/\D/g, "");
    return prisma.sacado.findMany({
      where: busca
        ? {
            OR: [
              { nome: { contains: busca, mode: "insensitive" } },
              ...(digitos ? [{ cpfCnpj: { contains: digitos } }] : []),
            ],
          }
        : {},
      orderBy: { nome: "asc" },
      take: 20,
    });
  },

  create(data: Prisma.SacadoCreateInput) {
    return prisma.sacado.create({ data });
  },

  update(id: string, data: Prisma.SacadoUpdateInput) {
    return prisma.sacado.update({ where: { id }, data });
  },
};
