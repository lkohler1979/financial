import { ClicksignAutenticacao, Prisma, ProvedorAssinatura } from "@prisma/client";
import { prisma } from "../../database/prisma";

export const contratosRepository = {
  matriculaCompleta(id: string) {
    return prisma.matricula.findUnique({
      where: { id },
      include: {
        aluno: true,
        curso: true,
        sacado: true,
        parcelas: { orderBy: { vencimento: "asc" }, take: 1 },
      },
    });
  },

  ultimoDaMatricula(matriculaId: string) {
    return prisma.contratoMatricula.findFirst({
      where: { matriculaId },
      orderBy: { enviadoEm: "desc" },
    });
  },

  porId(id: string) {
    return prisma.contratoMatricula.findUnique({ where: { id } });
  },

  /** Acha o contrato em aberto cujo envelope ou documento aparece entre os textos do webhook. */
  porIdentificadores(textos: string[]) {
    const ids = [...new Set(textos.filter((t) => t.length >= 8 && t.length <= 64))];
    if (ids.length === 0) return Promise.resolve(null);
    return prisma.contratoMatricula.findFirst({
      where: { OR: [{ envelopeId: { in: ids } }, { documentoExternoId: { in: ids } }] },
      orderBy: { enviadoEm: "desc" },
    });
  },

  criar(dados: {
    matriculaId: string;
    provedor: ProvedorAssinatura;
    envelopeId: string | null;
    documentoExternoId: string;
    contratanteNome: string;
    contratanteEmail: string;
    autenticacao: ClicksignAutenticacao;
    arquivoGeradoChave: string;
    enviadoPorId: string;
  }) {
    return prisma.contratoMatricula.create({ data: dados });
  },

  atualizar(id: string, data: Prisma.ContratoMatriculaUpdateInput) {
    return prisma.contratoMatricula.update({ where: { id }, data });
  },

  /**
   * Contratos que o monitoramento precisa conferir: os aguardando assinatura (há até 90 dias) e os
   * já assinados cujo PDF ainda não foi baixado (há até 7 dias). Do mais antigo para o mais novo.
   */
  paraMonitorar(limite: number, agora: Date = new Date()) {
    const dias = (n: number) => new Date(agora.getTime() - n * 24 * 60 * 60_000);
    return prisma.contratoMatricula.findMany({
      where: {
        documentoExternoId: { not: null },
        OR: [
          { status: "ENVIADO", enviadoEm: { gte: dias(90) } },
          { status: "ASSINADO", arquivoAssinadoChave: null, assinadoEm: { gte: dias(7) } },
        ],
      },
      orderBy: { enviadoEm: "asc" },
      take: limite,
    });
  },

  /** Marca o contrato como assinado e reflete na matrícula (mesma transação). */
  marcarAssinado(
    contrato: { id: string; matriculaId: string; assinadoEm?: Date | null },
    arquivoAssinadoChave: string | null,
  ) {
    return prisma.$transaction([
      prisma.contratoMatricula.update({
        where: { id: contrato.id },
        data: {
          status: "ASSINADO",
          // Reconferência de um contrato já assinado (para baixar o PDF) não muda a data.
          assinadoEm: contrato.assinadoEm ?? new Date(),
          ...(arquivoAssinadoChave ? { arquivoAssinadoChave } : {}),
        },
      }),
      prisma.matricula.update({
        where: { id: contrato.matriculaId },
        data: { contratoAssinado: true },
      }),
    ]);
  },
};
