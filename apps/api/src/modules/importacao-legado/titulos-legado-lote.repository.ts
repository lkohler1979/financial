import { Prisma, StatusLoteTitulos } from "@prisma/client";
import { prisma } from "../../database/prisma";

const EM_ANDAMENTO = StatusLoteTitulos.EM_ANDAMENTO;

export const titulosLegadoLoteRepository = {
  /** Alunos que podem ser consultados no legado (a busca é pelo CPF), por nome. */
  alunosParaBusca() {
    return prisma.aluno.findMany({
      select: { id: true, nome: true, cpf: true },
      orderBy: { nome: "asc" },
    });
  },

  criar(usuarioId: string, total: number) {
    return prisma.importacaoTitulosLote.create({ data: { usuarioId, total } });
  },

  findById(id: string) {
    return prisma.importacaoTitulosLote.findUnique({ where: { id } });
  },

  /** O lote mais recente (em andamento ou o último concluído) — alimenta a tela. */
  ultimo() {
    return prisma.importacaoTitulosLote.findFirst({ orderBy: { criadoEm: "desc" } });
  },

  atualizar(id: string, data: Prisma.ImportacaoTitulosLoteUpdateInput) {
    return prisma.importacaoTitulosLote.update({ where: { id }, data });
  },

  /** Lote que ainda deveria estar rodando (e se mexeu há pouco) — impede disparar dois ao mesmo tempo. */
  emAndamento(desde: Date) {
    return prisma.importacaoTitulosLote.findFirst({
      where: { status: EM_ANDAMENTO, atualizadoEm: { gte: desde } },
    });
  },

  /** Marca como FALHOU os lotes ainda "em andamento" (opcionalmente só os sem atividade desde...). */
  async marcarInterrompidos(motivo: string, semAtividadeDesde?: Date) {
    const r = await prisma.importacaoTitulosLote.updateMany({
      where: {
        status: EM_ANDAMENTO,
        ...(semAtividadeDesde ? { atualizadoEm: { lt: semAtividadeDesde } } : {}),
      },
      data: { status: StatusLoteTitulos.FALHOU, finalizadoEm: new Date(), mensagemFalha: motivo },
    });
    return r.count;
  },

  /** Conclui o lote — só se ninguém o interrompeu no meio. */
  concluir(loteId: string) {
    return prisma.importacaoTitulosLote.updateMany({
      where: { id: loteId, status: EM_ANDAMENTO },
      data: { status: StatusLoteTitulos.CONCLUIDO, finalizadoEm: new Date() },
    });
  },
};
