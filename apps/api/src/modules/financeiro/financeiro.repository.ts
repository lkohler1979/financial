import { Prisma, StatusParcela } from "@prisma/client";
import { prisma } from "../../database/prisma";

export interface ListarParcelasParams {
  matriculaId?: string;
  status?: StatusParcela;
  skip: number;
  take: number;
}

const incluiMatricula = {
  matricula: {
    select: {
      id: true,
      numeroMatricula: true,
      aluno: { select: { id: true, cpf: true, nome: true } },
      curso: { select: { id: true, codigo: true, nome: true } },
    },
  },
} satisfies Prisma.ParcelaInclude;

export const financeiroRepository = {
  findById(id: string) {
    return prisma.parcela.findUnique({ where: { id }, include: incluiMatricula });
  },

  findByChaveNatural(matriculaId: string, codTitulo: string) {
    return prisma.parcela.findUnique({
      where: { matriculaId_codTitulo: { matriculaId, codTitulo } },
    });
  },

  async list({ matriculaId, status, skip, take }: ListarParcelasParams) {
    const where: Prisma.ParcelaWhereInput = {
      ...(matriculaId ? { matriculaId } : {}),
      ...(status ? { status } : {}),
    };

    const [data, total] = await Promise.all([
      prisma.parcela.findMany({
        where,
        skip,
        take,
        orderBy: { vencimento: "asc" },
        include: incluiMatricula,
      }),
      prisma.parcela.count({ where }),
    ]);

    return { data, total };
  },

  /** Parcelas ainda em aberto (não pagas, não protestadas, não canceladas)
   * de uma matrícula — usado para decidir se o protesto ficou completo. */
  contarEmAbertoPorMatricula(matriculaId: string) {
    return prisma.parcela.count({ where: { matriculaId, status: "EM_ABERTO" } });
  },

  create(data: Prisma.ParcelaCreateInput) {
    return prisma.parcela.create({ data, include: incluiMatricula });
  },

  update(id: string, data: Prisma.ParcelaUpdateInput) {
    return prisma.parcela.update({ where: { id }, data, include: incluiMatricula });
  },
};
