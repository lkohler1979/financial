import { prisma } from "../../database/prisma";

/** Quem está logado na área do aluno: o aluno (vê tudo dele) ou um sacado (só os títulos que paga). */
export interface SessaoPortal {
  alunoId?: string;
  sacadoId?: string;
}

const donoDaMatricula = (sessao: SessaoPortal) =>
  sessao.alunoId ? { alunoId: sessao.alunoId } : { sacadoId: sessao.sacadoId };

export const portalRepository = {
  findAlunoPorCpf(cpf: string) {
    return prisma.aluno.findUnique({ where: { cpf } });
  },

  findSacadoPorDocumento(cpfCnpj: string) {
    return prisma.sacado.findUnique({ where: { cpfCnpj } });
  },

  findSacado(id: string) {
    return prisma.sacado.findUnique({
      where: { id },
      select: { id: true, tipoPessoa: true, cpfCnpj: true, nome: true, email: true },
    });
  },

  /** Segundo fator do CNPJ: o número de uma matrícula que o sacado paga. */
  findMatriculaDoSacadoPorNumero(sacadoId: string, numeroMatricula: string) {
    return prisma.matricula.findFirst({ where: { sacadoId, numeroMatricula }, select: { id: true } });
  },

  findAluno(id: string) {
    return prisma.aluno.findUnique({
      where: { id },
      select: { id: true, codigo: true, nome: true, cpf: true, email: true },
    });
  },

  listarMatriculas(sessao: SessaoPortal) {
    return prisma.matricula.findMany({
      where: donoDaMatricula(sessao),
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

  listarParcelas(sessao: SessaoPortal) {
    return prisma.parcela.findMany({
      where: { matricula: donoDaMatricula(sessao) },
      orderBy: [{ vencimento: "asc" }, { codTitulo: "asc" }],
      select: {
        id: true,
        matriculaId: true,
        codTitulo: true,
        matricula: {
          select: {
            curso: { select: { nome: true } },
            aluno: { select: { nome: true } },
            sacado: { select: { nome: true } },
          },
        },
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

  findParcelaDoDono(parcelaId: string, sessao: SessaoPortal) {
    return prisma.parcela.findFirst({
      where: { id: parcelaId, matricula: donoDaMatricula(sessao) },
      select: { id: true, status: true, formaPagamento: true },
    });
  },

  findDocumentoDoAluno(documentoId: string, alunoId: string) {
    return prisma.documento.findFirst({ where: { id: documentoId, alunoId } });
  },
};
