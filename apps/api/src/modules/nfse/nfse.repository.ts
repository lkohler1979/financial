import { Prisma } from "@prisma/client";
import { prisma } from "../../database/prisma";

// Só estes tipos geram NFS-e (pedido do usuário, 2026-10-12): mensalidade e renegociação.
// Taxa de matrícula e demais tipos ficam de fora. Comparação sem diferenciar maiúsculas
// e aceitando "Renegociacao" (importações antigas sem acento).
export const TIPOS_COM_NFSE = ["Mensalidade", "Renegociação", "Renegociacao"];

const incluiTomador = {
  matricula: {
    select: {
      id: true,
      numeroMatricula: true,
      curso: { select: { nome: true } },
      aluno: {
        select: {
          id: true,
          nome: true,
          cpf: true,
          email: true,
          cep: true,
          endereco: true,
          numero: true,
          complemento: true,
          bairro: true,
        },
      },
      sacado: {
        select: {
          id: true,
          tipoPessoa: true,
          nome: true,
          cpfCnpj: true,
          email: true,
          cep: true,
          endereco: true,
          numero: true,
          complemento: true,
          bairro: true,
        },
      },
    },
  },
} satisfies Prisma.ParcelaInclude;

const dosTipos: Prisma.ParcelaWhereInput = {
  OR: TIPOS_COM_NFSE.map((nome) => ({ tipoTitulo: { equals: nome, mode: "insensitive" as const } })),
};

export type ParcelaParaNota = Prisma.ParcelaGetPayload<{ include: typeof incluiTomador }>;

export const nfseRepository = {
  /**
   * Parcelas de mensalidade/renegociação pagas em [inicio, fim) cuja nota ainda não foi
   * autorizada (sem nota, com erro ou agendada aguardando emissão).
   */
  listarPendentes(inicio: Date, fim: Date, limite?: number): Promise<ParcelaParaNota[]> {
    return prisma.parcela.findMany({
      where: {
        status: "PAGO",
        dataPagamento: { gte: inicio, lt: fim },
        AND: [dosTipos, { OR: [{ nfseStatus: null }, { nfseStatus: { in: ["ERRO", "AGENDADA"] } }] }],
      },
      orderBy: [{ dataPagamento: "asc" }, { id: "asc" }],
      ...(limite ? { take: limite } : {}),
      include: incluiTomador,
    });
  },

  contarPendentes(inicio: Date, fim: Date) {
    return prisma.parcela.count({
      where: {
        status: "PAGO",
        dataPagamento: { gte: inicio, lt: fim },
        AND: [dosTipos, { OR: [{ nfseStatus: null }, { nfseStatus: { in: ["ERRO", "AGENDADA"] } }] }],
      },
    });
  },

  /**
   * Pagamentos realizados (qualquer tipo) para a emissão individual: filtra por aluno, CPF/CNPJ
   * do aluno ou do sacado, número da matrícula e/ou período de pagamento. Mais recentes primeiro.
   */
  buscarPagas(filtros: { busca?: string; inicio?: Date; fim?: Date; limite: number }): Promise<ParcelaParaNota[]> {
    const busca = filtros.busca?.trim();
    const digitos = busca?.replace(/\D/g, "");
    return prisma.parcela.findMany({
      where: {
        status: "PAGO",
        ...(filtros.inicio || filtros.fim
          ? { dataPagamento: { ...(filtros.inicio ? { gte: filtros.inicio } : {}), ...(filtros.fim ? { lt: filtros.fim } : {}) } }
          : {}),
        ...(busca
          ? {
              matricula: {
                OR: [
                  { aluno: { nome: { contains: busca, mode: "insensitive" as const } } },
                  { numeroMatricula: { contains: busca, mode: "insensitive" as const } },
                  ...(digitos && digitos.length >= 3
                    ? [{ aluno: { cpf: { contains: digitos } } }, { sacado: { cpfCnpj: { contains: digitos } } }]
                    : []),
                  { sacado: { nome: { contains: busca, mode: "insensitive" as const } } },
                ],
              },
            }
          : {}),
      },
      orderBy: [{ dataPagamento: "desc" }, { id: "asc" }],
      take: filtros.limite,
      include: incluiTomador,
    });
  },

  /** Notas já geradas (qualquer situação) para a competência informada. */
  listarNotasDaCompetencia(inicio: Date, fim: Date): Promise<ParcelaParaNota[]> {
    return prisma.parcela.findMany({
      where: { nfseStatus: { not: null }, nfseCompetencia: { gte: inicio, lt: fim } },
      orderBy: [{ nfseStatus: "asc" }, { dataPagamento: "asc" }],
      include: incluiTomador,
    });
  },

  /** Notas agendadas no Asaas que ainda não viraram AUTORIZADA (precisam de consulta). */
  listarAgendadas(): Promise<ParcelaParaNota[]> {
    return prisma.parcela.findMany({
      where: { nfseStatus: "AGENDADA", nfseAsaasId: { not: null } },
      take: 200,
      include: incluiTomador,
    });
  },

  findById(id: string): Promise<ParcelaParaNota | null> {
    return prisma.parcela.findUnique({ where: { id }, include: incluiTomador });
  },

  update(id: string, data: Prisma.ParcelaUpdateInput) {
    return prisma.parcela.update({ where: { id }, data });
  },
};
