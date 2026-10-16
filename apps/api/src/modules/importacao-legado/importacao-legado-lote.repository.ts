import { Prisma, StatusLoteLegado } from "@prisma/client";
import { prisma } from "../../database/prisma";

export const importacaoLegadoLoteRepository = {
  criar(usuarioId: string, limite?: number) {
    return prisma.importacaoLegadoLote.create({ data: { usuarioId, limite: limite ?? null } });
  },

  findById(id: string) {
    return prisma.importacaoLegadoLote.findUnique({ where: { id } });
  },

  /** O lote mais recente (em andamento ou o último concluído) — alimenta a tela. */
  ultimo() {
    return prisma.importacaoLegadoLote.findFirst({ orderBy: { criadoEm: "desc" } });
  },

  atualizar(id: string, data: Prisma.ImportacaoLegadoLoteUpdateInput) {
    return prisma.importacaoLegadoLote.update({ where: { id }, data });
  },

  /** Lote que ainda deveria estar rodando (e se mexeu há pouco) — impede disparar dois ao mesmo tempo. */
  emAndamento(desde: Date) {
    return prisma.importacaoLegadoLote.findFirst({
      where: {
        status: { in: [StatusLoteLegado.ENUMERANDO, StatusLoteLegado.IMPORTANDO] },
        atualizadoEm: { gte: desde },
      },
    });
  },
};
