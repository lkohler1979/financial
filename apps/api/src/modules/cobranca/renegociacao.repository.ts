import type { Prisma } from "@prisma/client";
import { prisma } from "../../database/prisma";
import { ConflictError } from "../../shared/errors/app-error";
import {
  STATUS_RENEGOCIAVEIS,
  TIPO_TITULO_RENEGOCIACAO,
  type PlanoRenegociacao,
} from "./renegociacao";

export interface EfetivarRenegociacao {
  matriculaId: string;
  usuarioId: string;
  plano: PlanoRenegociacao;
  numeroParcelas: number;
  primeiroVencimento: Date;
  /** Texto do histórico da matrícula, montado a partir do número da renegociação. */
  historico: (numero: number) => string;
}

const incluiVinculos = {
  parcelasOriginais: { orderBy: { vencimento: "asc" } },
  parcelasGeradas: { orderBy: { vencimento: "asc" } },
} satisfies Prisma.RenegociacaoInclude;

export const renegociacaoRepository = {
  /** Parcelas da matrícula entre as pedidas (as de outra matrícula nem aparecem). */
  buscarParcelas(matriculaId: string, ids: string[]) {
    return prisma.parcela.findMany({ where: { matriculaId, id: { in: ids } } });
  },

  listarPorMatricula(matriculaId: string) {
    return prisma.renegociacao.findMany({
      where: { matriculaId },
      orderBy: { numero: "desc" },
      include: incluiVinculos,
    });
  },

  /**
   * Tudo ou nada: cria a renegociação, passa as parcelas escolhidas a RENEGOCIADO ligando-as a ela,
   * cria as novas parcelas ligadas à mesma renegociação e registra no histórico. Se alguma parcela
   * escolhida deixou de ser renegociável entre a simulação e a confirmação (foi paga, já
   * renegociada…), nada é gravado.
   */
  efetivar(dados: EfetivarRenegociacao) {
    const { plano } = dados;
    const ids = plano.parcelas.map((p) => p.id);
    return prisma.$transaction(async (tx) => {
      const ultimo = await tx.renegociacao.aggregate({
        where: { matriculaId: dados.matriculaId },
        _max: { numero: true },
      });
      const numero = (ultimo._max.numero ?? 0) + 1;

      const renegociacao = await tx.renegociacao.create({
        data: {
          matriculaId: dados.matriculaId,
          usuarioId: dados.usuarioId,
          numero,
          valorOriginal: plano.valorOriginal,
          multa: plano.multa,
          juros: plano.juros,
          totalDevido: plano.totalDevido,
          desconto: plano.desconto,
          valorNegociado: plano.valorNegociado,
          numeroParcelas: dados.numeroParcelas,
          primeiroVencimento: dados.primeiroVencimento,
        },
      });

      const quitadas = await tx.parcela.updateMany({
        where: {
          id: { in: ids },
          matriculaId: dados.matriculaId,
          status: { in: [...STATUS_RENEGOCIAVEIS] },
        },
        data: { status: "RENEGOCIADO", renegociadaEmId: renegociacao.id },
      });
      if (quitadas.count !== ids.length) {
        throw new ConflictError(
          "Alguma parcela selecionada mudou de estado (foi paga ou renegociada). Recarregue a ficha e tente de novo",
        );
      }

      await tx.parcela.createMany({
        data: plano.novasParcelas.map((n) => ({
          matriculaId: dados.matriculaId,
          codTitulo: `R${numero}-${n.numero}`,
          parcela: `${n.numero}/${dados.numeroParcelas}`,
          vencimento: n.vencimento,
          valor: n.valor,
          tipoTitulo: TIPO_TITULO_RENEGOCIACAO,
          status: "EM_ABERTO" as const,
          origemRenegociacaoId: renegociacao.id,
        })),
      });

      await tx.historicoCobranca.create({
        data: {
          matriculaId: dados.matriculaId,
          usuarioId: dados.usuarioId,
          acao: dados.historico(numero),
        },
      });

      return tx.renegociacao.findUniqueOrThrow({
        where: { id: renegociacao.id },
        include: incluiVinculos,
      });
    });
  },
};
