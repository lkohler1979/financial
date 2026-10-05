import { prisma } from "../../database/prisma";

export const portalRepository = {
  findAlunoPorCpf(cpf: string) {
    return prisma.aluno.findUnique({ where: { cpf } });
  },

  findAluno(id: string) {
    return prisma.aluno.findUnique({
      where: { id },
      select: { id: true, codigo: true, nome: true, cpf: true, email: true },
    });
  },

  listarMatriculas(alunoId: string) {
    return prisma.matricula.findMany({
      where: { alunoId },
      orderBy: { dataMatricula: "desc" },
      select: {
        id: true,
        numeroMatricula: true,
        dataMatricula: true,
        curso: { select: { id: true, nome: true } },
      },
    });
  },

  findMatriculaDoAluno(matriculaId: string, alunoId: string) {
    return prisma.matricula.findFirst({ where: { id: matriculaId, alunoId }, select: { id: true } });
  },

  listarParcelas(alunoId: string) {
    return prisma.parcela.findMany({
      where: { matricula: { alunoId } },
      orderBy: [{ vencimento: "asc" }, { codTitulo: "asc" }],
      select: {
        id: true,
        matriculaId: true,
        parcela: true,
        tipoTitulo: true,
        vencimento: true,
        valor: true,
        status: true,
        dataPagamento: true,
        valorPago: true,
        formaPagamento: true,
        asaasBillingType: true,
        asaasBoletoUrl: true,
        asaasLinhaDigitavel: true,
        asaasInvoiceUrl: true,
        asaasPixQrCodeImagem: true,
        asaasPixCopiaECola: true,
      },
    });
  },

  findParcelaDoAluno(parcelaId: string, alunoId: string) {
    return prisma.parcela.findFirst({
      where: { id: parcelaId, matricula: { alunoId } },
      select: { id: true, status: true, formaPagamento: true },
    });
  },

  findDocumentoDoAluno(documentoId: string, alunoId: string) {
    return prisma.documento.findFirst({ where: { id: documentoId, alunoId } });
  },
};
