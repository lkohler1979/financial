import { Prisma } from "@prisma/client";
import { prisma } from "../../database/prisma";
import type { ListarAuditoriaParams } from "./auditoria.service";

export const auditoriaRepository = {
  async list({
    entidade,
    usuario,
    acao,
    dataInicio,
    dataFim,
    page,
    pageSize,
  }: ListarAuditoriaParams) {
    const where: Prisma.AuditoriaWhereInput = {
      ...(entidade ? { entidade } : {}),
      ...(acao ? { acao } : {}),
      ...(dataInicio || dataFim
        ? {
            data: {
              ...(dataInicio ? { gte: dataInicio } : {}),
              ...(dataFim ? { lte: dataFim } : {}),
            },
          }
        : {}),
      ...(usuario
        ? {
            usuario: {
              is: {
                OR: [
                  { id: usuario },
                  { nome: { contains: usuario, mode: "insensitive" } },
                  { email: { contains: usuario, mode: "insensitive" } },
                ],
              },
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      prisma.auditoria.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { data: "desc" },
        include: { usuario: { select: { id: true, nome: true, email: true } } },
      }),
      prisma.auditoria.count({ where }),
    ]);

    return { data, total, page, pageSize };
  },

  async listarEntidades(): Promise<string[]> {
    const entidades = await prisma.auditoria.findMany({
      distinct: ["entidade"],
      select: { entidade: true },
      orderBy: { entidade: "asc" },
    });
    return entidades.map((item) => item.entidade);
  },
};
