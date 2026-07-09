import { prisma } from "../../database/prisma";

export const tagsRepository = {
  findById(id: string) {
    return prisma.tag.findUnique({ where: { id } });
  },

  findByNome(nome: string) {
    return prisma.tag.findUnique({ where: { nome } });
  },

  list() {
    return prisma.tag.findMany({ orderBy: { nome: "asc" } });
  },

  create(nome: string) {
    return prisma.tag.create({ data: { nome } });
  },

  /** Busca por nome ou cria, se ainda não existir (mesmo padrão de
   * situacoesRepository.obterOuCriarPorNome). */
  async obterOuCriarPorNome(nome: string) {
    const existente = await prisma.tag.findUnique({ where: { nome } });
    if (existente) return existente;
    return prisma.tag.create({ data: { nome } });
  },

  delete(id: string) {
    return prisma.tag.delete({ where: { id } });
  },

  countMatriculas(tagId: string) {
    return prisma.matriculaTag.count({ where: { tagId } });
  },

  // --- Associação N:N com Matrícula ---
  findAssociacao(matriculaId: string, tagId: string) {
    return prisma.matriculaTag.findUnique({
      where: { matriculaId_tagId: { matriculaId, tagId } },
    });
  },

  listarTagsDaMatricula(matriculaId: string) {
    return prisma.matriculaTag.findMany({
      where: { matriculaId },
      include: { tag: true },
    });
  },

  associar(matriculaId: string, tagId: string) {
    return prisma.matriculaTag.create({ data: { matriculaId, tagId } });
  },

  desassociar(matriculaId: string, tagId: string) {
    return prisma.matriculaTag.delete({
      where: { matriculaId_tagId: { matriculaId, tagId } },
    });
  },
};
