import { Prisma } from "@prisma/client";
import { prisma } from "../../database/prisma";

export interface ListarAlunosParams {
  busca?: string;
  skip: number;
  take: number;
}

export const alunosRepository = {
  findById(id: string) {
    return prisma.aluno.findUnique({ where: { id } });
  },

  findByCpf(cpf: string) {
    return prisma.aluno.findUnique({ where: { cpf } });
  },

  async list({ busca, skip, take }: ListarAlunosParams) {
    const where: Prisma.AlunoWhereInput = busca
      ? {
          OR: [
            { nome: { contains: busca, mode: "insensitive" } },
            { cpf: { contains: busca.replace(/\D/g, "") } },
          ],
        }
      : {};

    const [data, total] = await Promise.all([
      prisma.aluno.findMany({ where, skip, take, orderBy: { nome: "asc" } }),
      prisma.aluno.count({ where }),
    ]);

    return { data, total };
  },

  create(data: Prisma.AlunoCreateInput) {
    return prisma.aluno.create({ data });
  },

  update(id: string, data: Prisma.AlunoUpdateInput) {
    return prisma.aluno.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.aluno.delete({ where: { id } });
  },

  countMatriculas(alunoId: string) {
    return prisma.matricula.count({ where: { alunoId } });
  },
};
