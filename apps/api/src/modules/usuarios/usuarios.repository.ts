import { Prisma } from "@prisma/client";
import { prisma } from "../../database/prisma";

export interface ListarUsuariosParams {
  busca?: string;
  skip: number;
  take: number;
}

// Seleção padrão que nunca inclui `senhaHash` nas respostas da API.
const SELECAO_SEGURA = {
  id: true,
  nome: true,
  email: true,
  perfil: true,
  ativo: true,
  criadoEm: true,
} satisfies Prisma.UsuarioSelect;

export const usuariosRepository = {
  findByEmail(email: string) {
    return prisma.usuario.findUnique({ where: { email } });
  },

  findByIdSeguro(id: string) {
    return prisma.usuario.findUnique({ where: { id }, select: SELECAO_SEGURA });
  },

  async list({ busca, skip, take }: ListarUsuariosParams) {
    const where: Prisma.UsuarioWhereInput = busca
      ? {
          OR: [
            { nome: { contains: busca, mode: "insensitive" } },
            { email: { contains: busca, mode: "insensitive" } },
          ],
        }
      : {};

    const [data, total] = await Promise.all([
      prisma.usuario.findMany({ where, skip, take, orderBy: { nome: "asc" }, select: SELECAO_SEGURA }),
      prisma.usuario.count({ where }),
    ]);

    return { data, total };
  },

  create(data: Prisma.UsuarioCreateInput) {
    return prisma.usuario.create({ data, select: SELECAO_SEGURA });
  },

  update(id: string, data: Prisma.UsuarioUpdateInput) {
    return prisma.usuario.update({ where: { id }, data, select: SELECAO_SEGURA });
  },
};
