import { Prisma } from "@prisma/client";
import { prisma } from "../../database/prisma";
import { MAPEAMENTOS_PADRAO } from "./mapeamento-importacao.constants";

export const mapeamentoImportacaoRepository = {
  findById(id: string) {
    return prisma.mapeamentoImportacao.findUnique({ where: { id } });
  },

  findByColuna(colunaPlanilha: string) {
    return prisma.mapeamentoImportacao.findUnique({ where: { colunaPlanilha } });
  },

  /** Semeia o mapeamento padrão (planilha já importada) na primeira execução. */
  async listarOuSemear() {
    const total = await prisma.mapeamentoImportacao.count();
    if (total === 0) {
      await prisma.mapeamentoImportacao.createMany({ data: MAPEAMENTOS_PADRAO });
    }
    return prisma.mapeamentoImportacao.findMany({ orderBy: [{ tabelaDestino: "asc" }, { campoDestino: "asc" }] });
  },

  listarAtivos() {
    return prisma.mapeamentoImportacao.findMany({ where: { ativo: true } });
  },

  create(data: Prisma.MapeamentoImportacaoCreateInput) {
    return prisma.mapeamentoImportacao.create({ data });
  },

  update(id: string, data: Prisma.MapeamentoImportacaoUpdateInput) {
    return prisma.mapeamentoImportacao.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.mapeamentoImportacao.delete({ where: { id } });
  },
};
