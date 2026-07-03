import { Prisma } from "@prisma/client";
import { prisma } from "../../database/prisma";

export interface ListarMatriculasParams {
  alunoId?: string;
  cursoId?: string;
  situacao?: string;
  skip: number;
  take: number;
}

const incluiAlunoCurso = {
  aluno: { select: { id: true, cpf: true, nome: true } },
  curso: { select: { id: true, codigo: true, nome: true } },
  situacaoCobranca: { select: { id: true, nome: true, cor: true } },
} satisfies Prisma.MatriculaInclude;

export const matriculasRepository = {
  findById(id: string) {
    return prisma.matricula.findUnique({ where: { id }, include: incluiAlunoCurso });
  },

  findByChaveNatural(alunoId: string, cursoId: string, numeroMatricula: string) {
    return prisma.matricula.findUnique({
      where: {
        alunoId_cursoId_numeroMatricula: { alunoId, cursoId, numeroMatricula },
      },
    });
  },

  /**
   * Busca por aluno+curso, ignorando o número da matrícula — usado pela
   * importação, cuja planilha não traz esse campo (PRD seção 11).
   */
  findByAlunoECurso(alunoId: string, cursoId: string) {
    return prisma.matricula.findFirst({ where: { alunoId, cursoId } });
  },

  async list({ alunoId, cursoId, situacao, skip, take }: ListarMatriculasParams) {
    const where: Prisma.MatriculaWhereInput = {
      ...(alunoId ? { alunoId } : {}),
      ...(cursoId ? { cursoId } : {}),
      ...(situacao ? { situacao } : {}),
    };

    const [data, total] = await Promise.all([
      prisma.matricula.findMany({
        where,
        skip,
        take,
        orderBy: { dataMatricula: "desc" },
        include: incluiAlunoCurso,
      }),
      prisma.matricula.count({ where }),
    ]);

    return { data, total };
  },

  create(data: Prisma.MatriculaCreateInput) {
    return prisma.matricula.create({ data, include: incluiAlunoCurso });
  },

  update(id: string, data: Prisma.MatriculaUpdateInput) {
    return prisma.matricula.update({ where: { id }, data, include: incluiAlunoCurso });
  },

  delete(id: string) {
    return prisma.matricula.delete({ where: { id } });
  },

  countParcelas(matriculaId: string) {
    return prisma.parcela.count({ where: { matriculaId } });
  },
};
