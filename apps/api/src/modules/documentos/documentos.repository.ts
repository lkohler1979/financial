import { Prisma } from "@prisma/client";
import { prisma } from "../../database/prisma";

const incluiTipo = {
  tipo: true,
  validadoPor: { select: { id: true, nome: true } },
} satisfies Prisma.DocumentoInclude;

export const documentosRepository = {
  listarTiposAtivos() {
    return prisma.tipoDocumento.findMany({ where: { ativo: true }, orderBy: { ordem: "asc" } });
  },

  findTipo(id: string) {
    return prisma.tipoDocumento.findUnique({ where: { id } });
  },

  findMatricula(id: string) {
    return prisma.matricula.findUnique({ where: { id }, select: { id: true, alunoId: true } });
  },

  /** Documentos já criados da matrícula + os de escopo ALUNO do aluno dela. */
  listarDaMatricula(matriculaId: string, alunoId: string) {
    return prisma.documento.findMany({
      where: { OR: [{ matriculaId }, { alunoId, matriculaId: null }] },
      include: incluiTipo,
    });
  },

  findById(id: string) {
    return prisma.documento.findUnique({ where: { id }, include: incluiTipo });
  },

  findPorTipo(tipoDocumentoId: string, alunoId: string, matriculaId: string | null) {
    return prisma.documento.findFirst({
      where: { tipoDocumentoId, alunoId, matriculaId },
      include: incluiTipo,
    });
  },

  create(data: Prisma.DocumentoUncheckedCreateInput) {
    return prisma.documento.create({ data, include: incluiTipo });
  },

  update(id: string, data: Prisma.DocumentoUncheckedUpdateInput) {
    return prisma.documento.update({ where: { id }, data, include: incluiTipo });
  },

  findUsuario(id: string) {
    return prisma.usuario.findUnique({
      where: { id },
      select: { id: true, perfil: true, podeDeferirDocumentos: true },
    });
  },
};
