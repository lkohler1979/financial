import { ClicksignAutenticacao, Prisma } from "@prisma/client";
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
      where: { OR: [{ envelopeId: { in: ids } }, { documentoClicksignId: { in: ids } }] },
      orderBy: { enviadoEm: "desc" },
    });
  },

  criar(dados: {
    matriculaId: string;
    envelopeId: string;
    documentoClicksignId: string;
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

  /** Marca o contrato como assinado e reflete na matrícula (mesma transação). */
  marcarAssinado(
    contrato: { id: string; matriculaId: string },
    arquivoAssinadoChave: string | null,
  ) {
    return prisma.$transaction([
      prisma.contratoMatricula.update({
        where: { id: contrato.id },
        data: {
          status: "ASSINADO",
          assinadoEm: new Date(),
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
