import { Prisma, StatusLoteLegado, TipoOcorrenciaLote } from "@prisma/client";
import { prisma } from "../../database/prisma";

export interface NovaOcorrencia {
  tipo: TipoOcorrenciaLote;
  pessoaNome?: string | null;
  cpf?: string | null;
  pesId?: string | null;
  curso?: string | null;
  titulo?: string | null;
  motivo: string;
}

const TAMANHO_LOTE_INSERT = 500;

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

  /**
   * Marca como FALHOU os lotes ainda "em andamento" (opcionalmente só os sem atividade desde
   * `semAtividadeDesde`): o servidor reiniciou ou o worker caiu no meio da busca.
   */
  async marcarInterrompidos(motivo: string, semAtividadeDesde?: Date) {
    const resultado = await prisma.importacaoLegadoLote.updateMany({
      where: {
        status: { in: [StatusLoteLegado.ENUMERANDO, StatusLoteLegado.IMPORTANDO] },
        ...(semAtividadeDesde ? { atualizadoEm: { lt: semAtividadeDesde } } : {}),
      },
      data: { status: StatusLoteLegado.FALHOU, finalizadoEm: new Date(), mensagemFalha: motivo },
    });
    return resultado.count;
  },

  async registrarOcorrencias(loteId: string, ocorrencias: NovaOcorrencia[]) {
    for (let i = 0; i < ocorrencias.length; i += TAMANHO_LOTE_INSERT) {
      await prisma.importacaoLegadoOcorrencia.createMany({
        data: ocorrencias.slice(i, i + TAMANHO_LOTE_INSERT).map((o) => ({ ...o, loteId })),
      });
    }
  },

  async contarOcorrenciasPorTipo(
    loteId: string,
  ): Promise<Partial<Record<TipoOcorrenciaLote, number>>> {
    const grupos = await prisma.importacaoLegadoOcorrencia.groupBy({
      by: ["tipo"],
      where: { loteId },
      _count: { _all: true },
    });
    return Object.fromEntries(grupos.map((g) => [g.tipo, g._count._all]));
  },

  listarOcorrencias(loteId: string) {
    return prisma.importacaoLegadoOcorrencia.findMany({
      where: { loteId },
      orderBy: [{ tipo: "asc" }, { pessoaNome: "asc" }, { criadoEm: "asc" }],
    });
  },
};
