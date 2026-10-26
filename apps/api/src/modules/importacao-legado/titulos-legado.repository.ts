import type { Prisma } from "@prisma/client";
import { prisma } from "../../database/prisma";

/** Títulos do legado que não pertencem a nenhuma matrícula do Ethos (ver `TituloLegado`). */
export const titulosLegadoRepository = {
  listarDoAluno(alunoId: string) {
    return prisma.tituloLegado.findMany({ where: { alunoId }, orderBy: { vencimento: "asc" } });
  },

  /** Cria ou atualiza o título pelo código (o legado é a fonte de verdade). */
  gravar(
    alunoId: string,
    codTitulo: string,
    dados: Omit<Prisma.TituloLegadoCreateInput, "aluno" | "codTitulo">,
  ) {
    return prisma.tituloLegado.upsert({
      where: { alunoId_codTitulo: { alunoId, codTitulo } },
      create: { ...dados, codTitulo, aluno: { connect: { id: alunoId } } },
      update: dados,
    });
  },

  /** Apaga os registros soltos cujos códigos viraram parcela de uma matrícula. */
  apagarPorCodigos(alunoId: string, codigos: string[]) {
    if (codigos.length === 0) return Promise.resolve({ count: 0 });
    return prisma.tituloLegado.deleteMany({ where: { alunoId, codTitulo: { in: codigos } } });
  },
};
