import { Prisma, ResultadoItemDocumentos, StatusLoteDocumentos } from "@prisma/client";
import { prisma } from "../../database/prisma";

const EM_ANDAMENTO = StatusLoteDocumentos.EM_ANDAMENTO;
const TAMANHO_INSERT = 500;

export const documentosLegadoLoteRepository = {
  async criar(usuarioId: string, alunos: { id: string; nome: string; cpf: string }[]) {
    const lote = await prisma.importacaoDocumentosLote.create({
      data: { usuarioId, total: alunos.length },
    });
    for (let i = 0; i < alunos.length; i += TAMANHO_INSERT) {
      await prisma.importacaoDocumentosItem.createMany({
        data: alunos
          .slice(i, i + TAMANHO_INSERT)
          .map((a) => ({ loteId: lote.id, alunoId: a.id, alunoNome: a.nome, cpf: a.cpf })),
      });
    }
    return lote;
  },

  findById(id: string) {
    return prisma.importacaoDocumentosLote.findUnique({ where: { id } });
  },

  /** O lote mais recente (em andamento ou o último concluído) — alimenta a tela. */
  ultimo() {
    return prisma.importacaoDocumentosLote.findFirst({ orderBy: { criadoEm: "desc" } });
  },

  atualizar(id: string, data: Prisma.ImportacaoDocumentosLoteUpdateInput) {
    return prisma.importacaoDocumentosLote.update({ where: { id }, data });
  },

  /** Lote que ainda deveria estar rodando (e se mexeu há pouco) — impede disparar dois ao mesmo tempo. */
  emAndamento(desde: Date) {
    return prisma.importacaoDocumentosLote.findFirst({
      where: { status: EM_ANDAMENTO, atualizadoEm: { gte: desde } },
    });
  },

  /** Marca como FALHOU os lotes ainda "em andamento" (opcionalmente só os sem atividade desde...). */
  async marcarInterrompidos(motivo: string, semAtividadeDesde?: Date) {
    const r = await prisma.importacaoDocumentosLote.updateMany({
      where: {
        status: EM_ANDAMENTO,
        ...(semAtividadeDesde ? { atualizadoEm: { lt: semAtividadeDesde } } : {}),
      },
      data: {
        status: StatusLoteDocumentos.FALHOU,
        finalizadoEm: new Date(),
        mensagemFalha: motivo,
      },
    });
    return r.count;
  },

  /** Conclui o lote — só se ninguém o cancelou ou interrompeu no meio. */
  concluir(loteId: string) {
    return prisma.importacaoDocumentosLote.updateMany({
      where: { id: loteId, status: EM_ANDAMENTO },
      data: { status: StatusLoteDocumentos.CONCLUIDO, finalizadoEm: new Date() },
    });
  },

  proximoPendente(loteId: string) {
    return prisma.importacaoDocumentosItem.findFirst({
      where: { loteId, resultado: ResultadoItemDocumentos.PENDENTE },
      orderBy: { alunoNome: "asc" },
    });
  },

  atualizarItem(id: string, data: Prisma.ImportacaoDocumentosItemUpdateInput) {
    return prisma.importacaoDocumentosItem.update({ where: { id }, data });
  },

  /** Itens que merecem atenção (erro ou nada baixado) — a tela mostra os primeiros. */
  itensComProblema(loteId: string, take: number) {
    return prisma.importacaoDocumentosItem.findMany({
      where: {
        loteId,
        OR: [{ resultado: ResultadoItemDocumentos.ERRO }, { erros: { gt: 0 } }],
      },
      orderBy: { alunoNome: "asc" },
      take,
    });
  },

  itens(loteId: string) {
    return prisma.importacaoDocumentosItem.findMany({
      where: { loteId },
      orderBy: { alunoNome: "asc" },
    });
  },
};
