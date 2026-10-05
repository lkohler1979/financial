import { Prisma, StatusSolicitacao } from "@prisma/client";
import { prisma } from "../../database/prisma";

const incluiResumo = {
  tipo: { select: { id: true, nome: true } },
  aluno: { select: { id: true, codigo: true, nome: true, cpf: true } },
  matricula: { select: { id: true, numeroMatricula: true, curso: { select: { nome: true } } } },
  atendidoPor: { select: { id: true, nome: true } },
} satisfies Prisma.SolicitacaoDocumentoInclude;

export const solicitacoesRepository = {
  listarTipos(incluirInativos: boolean) {
    return prisma.tipoSolicitacao.findMany({
      where: incluirInativos ? {} : { ativo: true },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    });
  },

  findTipo(id: string) {
    return prisma.tipoSolicitacao.findUnique({ where: { id } });
  },

  findTipoPorNome(nome: string) {
    return prisma.tipoSolicitacao.findUnique({ where: { nome } });
  },

  criarTipo(data: Prisma.TipoSolicitacaoCreateInput) {
    return prisma.tipoSolicitacao.create({ data });
  },

  atualizarTipo(id: string, data: Prisma.TipoSolicitacaoUpdateInput) {
    return prisma.tipoSolicitacao.update({ where: { id }, data });
  },

  criar(data: Prisma.SolicitacaoDocumentoUncheckedCreateInput) {
    return prisma.solicitacaoDocumento.create({ data, include: incluiResumo });
  },

  findById(id: string) {
    return prisma.solicitacaoDocumento.findUnique({ where: { id }, include: incluiResumo });
  },

  update(id: string, data: Prisma.SolicitacaoDocumentoUncheckedUpdateInput) {
    return prisma.solicitacaoDocumento.update({ where: { id }, data, include: incluiResumo });
  },

  listarDoAluno(alunoId: string) {
    return prisma.solicitacaoDocumento.findMany({
      where: { alunoId },
      orderBy: { criadoEm: "desc" },
      include: incluiResumo,
    });
  },

  listar(status?: StatusSolicitacao) {
    return prisma.solicitacaoDocumento.findMany({
      where: status ? { status } : {},
      orderBy: { criadoEm: status === "ABERTA" ? "asc" : "desc" },
      take: 300,
      include: incluiResumo,
    });
  },

  contarAbertasDoTipo(tipoSolicitacaoId: string, alunoId: string, matriculaId: string | null) {
    return prisma.solicitacaoDocumento.count({
      where: { tipoSolicitacaoId, alunoId, matriculaId, status: "ABERTA" },
    });
  },
};
