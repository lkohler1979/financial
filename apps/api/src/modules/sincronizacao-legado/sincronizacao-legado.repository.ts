import { Prisma, TipoExecucaoSincronizacaoLegado } from "@prisma/client";
import { prisma } from "../../database/prisma";

export interface RegistrarExecucaoInput {
  usuarioId?: string;
  tipo: TipoExecucaoSincronizacaoLegado;
  totalConsultados: number;
  parcelasAtualizadas: number;
  naoEncontrados: number;
  erros?: Array<{ matriculaId?: string; mensagem: string }>;
}

export const sincronizacaoLegadoRepository = {
  registrarExecucao(input: RegistrarExecucaoInput) {
    return prisma.sincronizacaoLegado.create({
      data: {
        ...(input.usuarioId ? { usuario: { connect: { id: input.usuarioId } } } : {}),
        tipo: input.tipo,
        totalConsultados: input.totalConsultados,
        parcelasAtualizadas: input.parcelasAtualizadas,
        naoEncontrados: input.naoEncontrados,
        erros: input.erros && input.erros.length > 0 ? (input.erros as unknown as Prisma.InputJsonValue) : undefined,
      },
    });
  },

  async listarExecucoes(params: { skip: number; take: number }) {
    const [data, total] = await Promise.all([
      prisma.sincronizacaoLegado.findMany({
        skip: params.skip,
        take: params.take,
        orderBy: { data: "desc" },
        include: { usuario: { select: { id: true, nome: true } } },
      }),
      prisma.sincronizacaoLegado.count(),
    ]);
    return { data, total };
  },

  /**
   * Escopo padrão do job em lote (decisão do usuário, grilling 2026-09-11):
   * só matrículas com ao menos uma Parcela EM_ABERTO vencida — reduz a carga
   * de chamadas ao sistema legado em vez de varrer todo mundo cadastrado.
   */
  async listarMatriculaIdsComParcelaEmAtraso(): Promise<string[]> {
    const matriculas = await prisma.matricula.findMany({
      where: { parcelas: { some: { status: "EM_ABERTO", vencimento: { lt: new Date() } } } },
      select: { id: true },
    });
    return matriculas.map((matricula) => matricula.id);
  },

  /**
   * Ator usado na Auditoria de uma execução agendada (sem usuário logado):
   * o ADMINISTRADOR mais antigo cadastrado (tipicamente o admin seed inicial,
   * ver bootstrap/seed-admin.ts). `Auditoria.usuarioId` é obrigatório, então
   * uma execução automática precisa de um ator real, não de um id inventado.
   */
  async obterUsuarioSistema(): Promise<string | null> {
    const usuario = await prisma.usuario.findFirst({
      where: { perfil: "ADMINISTRADOR" },
      orderBy: { criadoEm: "asc" },
      select: { id: true },
    });
    return usuario?.id ?? null;
  },
};
