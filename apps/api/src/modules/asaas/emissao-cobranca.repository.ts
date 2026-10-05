import { prisma } from "../../database/prisma";

export const emissaoCobrancaRepository = {
  /** Tipos de cobrança com a política de emissão (nome casa com Parcela.tipoTitulo). */
  listarTipos() {
    return prisma.tipoCobranca.findMany({
      select: { nome: true, emissaoNaMatricula: true, formaPagamentoPadrao: true },
    });
  },

  /**
   * Parcelas em aberto, ainda sem cobrança emitida, que vencem entre `de` e
   * `ate` (inclusive). Mais antigas primeiro; `limite` protege o Asaas de uma
   * rajada de chamadas num único dia.
   */
  listarSemCobrancaVencendo(de: Date, ate: Date, limite: number) {
    return prisma.parcela.findMany({
      where: {
        status: "EM_ABERTO",
        asaasPaymentId: null,
        vencimento: { gte: de, lte: ate },
        tipoTitulo: { not: null },
      },
      orderBy: { vencimento: "asc" },
      take: limite,
      select: { id: true, tipoTitulo: true, formaPagamento: true, parcela: true, vencimento: true },
    });
  },
};
