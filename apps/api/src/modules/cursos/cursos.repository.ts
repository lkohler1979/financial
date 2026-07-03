import { Prisma } from "@prisma/client";
import { prisma } from "../../database/prisma";

export interface ListarCursosParams {
  busca?: string;
  situacao?: boolean;
  skip: number;
  take: number;
}

export const cursosRepository = {
  findById(id: string) {
    return prisma.curso.findUnique({ where: { id } });
  },

  findByCodigo(codigo: string) {
    return prisma.curso.findUnique({ where: { codigo } });
  },

  /** Busca por nome exato (case-insensitive) — usado pela importação, que só recebe o nome do curso. */
  findByNome(nome: string) {
    return prisma.curso.findFirst({ where: { nome: { equals: nome, mode: "insensitive" } } });
  },

  async list({ busca, situacao, skip, take }: ListarCursosParams) {
    const where: Prisma.CursoWhereInput = {
      ...(situacao !== undefined ? { situacao } : {}),
      ...(busca
        ? {
            OR: [
              { nome: { contains: busca, mode: "insensitive" } },
              { codigo: { contains: busca, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      prisma.curso.findMany({ where, skip, take, orderBy: { nome: "asc" } }),
      prisma.curso.count({ where }),
    ]);

    return { data, total };
  },

  create(data: Prisma.CursoCreateInput) {
    return prisma.curso.create({ data });
  },

  update(id: string, data: Prisma.CursoUpdateInput) {
    return prisma.curso.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.curso.delete({ where: { id } });
  },

  countMatriculas(cursoId: string) {
    return prisma.matricula.count({ where: { cursoId } });
  },
};
