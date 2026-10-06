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

  async listar(busca: string | undefined, skip: number, take: number) {
    const digitos = busca?.replace(/\D/g, "");
    const where: Prisma.SacadoWhereInput = busca
      ? {
          OR: [
            { nome: { contains: busca, mode: "insensitive" } },
            ...(digitos ? [{ cpfCnpj: { contains: digitos } }] : []),
          ],
        }
      : {};
    const [data, total] = await Promise.all([
      prisma.sacado.findMany({
        where,
        skip,
        take,
        orderBy: { nome: "asc" },
        include: { _count: { select: { matriculas: true } } },
      }),
      prisma.sacado.count({ where }),
    ]);
    return { data, total };
  },

  findComMatriculas(id: string) {
    return prisma.sacado.findUnique({
      where: { id },
      include: {
        matriculas: {
          orderBy: { dataMatricula: "desc" },
          select: {
            id: true,
            numeroMatricula: true,
            situacao: true,
            aluno: { select: { id: true, nome: true, codigo: true } },
            curso: { select: { id: true, nome: true } },
          },
        },
      },
    });
  },

  countMatriculas(id: string) {
    return prisma.matricula.count({ where: { sacadoId: id } });
  },

  delete(id: string) {
    return prisma.sacado.delete({ where: { id } });
  },

  create(data: Prisma.SacadoCreateInput) {
    return prisma.sacado.create({ data });
  },

  update(id: string, data: Prisma.SacadoUpdateInput) {
    return prisma.sacado.update({ where: { id }, data });
  },
};
