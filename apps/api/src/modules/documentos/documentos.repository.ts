import { Prisma } from "@prisma/client";
import { prisma } from "../../database/prisma";

const incluiTipo = {
  tipo: true,
  validadoPor: { select: { id: true, nome: true } },
} satisfies Prisma.DocumentoInclude;

export interface FiltrosDocumentos {
  situacao?: "PENDENTE" | "DEFERIDO" | "INDEFERIDO";
  busca?: string;
  tipoId?: string;
  cursoId?: string;
  de?: string;
  ate?: string;
}

export const documentosRepository = {
  listarTiposAtivos() {
    return prisma.tipoDocumento.findMany({ where: { ativo: true }, orderBy: { ordem: "asc" } });
  },

  listarTodosTipos() {
    return prisma.tipoDocumento.findMany({ orderBy: [{ ordem: "asc" }, { nome: "asc" }] });
  },

  findTipoPorNome(nome: string) {
    return prisma.tipoDocumento.findUnique({ where: { nome } });
  },

  criarTipo(data: Prisma.TipoDocumentoCreateInput) {
    return prisma.tipoDocumento.create({ data });
  },

  atualizarTipo(id: string, data: Prisma.TipoDocumentoUpdateInput) {
    return prisma.tipoDocumento.update({ where: { id }, data });
  },

  /** Fila de conferência: enviados e ainda não deferidos/indeferidos. */
  listarAguardandoConferencia() {
    return prisma.documento.findMany({
      where: { situacaoEntrega: "ENVIADO", situacaoDeferimento: "PENDENTE", tipo: { ativo: true } },
      orderBy: { anexadoEm: "asc" },
      include: {
        tipo: { select: { id: true, nome: true, escopo: true } },
        aluno: {
          select: {
            id: true,
            codigo: true,
            nome: true,
            cpf: true,
            matriculas: {
              select: { id: true, numeroMatricula: true },
              orderBy: { dataMatricula: "desc" },
            },
          },
        },
        matricula: { select: { id: true, numeroMatricula: true } },
      },
    });
  },

  /**
   * Todos os documentos com arquivo enviado (qualquer situação de deferimento), do mais recente ao
   * mais antigo, com aluno e as matrículas dele. `busca` procura no nome, CPF e código do aluno.
   */
  /** Filtro comum da consulta e do download em lote (sem a situação de deferimento). */
  whereEnviados(f: FiltrosDocumentos): Prisma.DocumentoWhereInput {
    const digitos = f.busca?.replace(/\D/g, "");
    const e: Prisma.DocumentoWhereInput[] = [{ situacaoEntrega: "ENVIADO" }];
    if (f.busca) {
      e.push({
        aluno: {
          OR: [
            { nome: { contains: f.busca, mode: "insensitive" } },
            { codigo: { contains: f.busca, mode: "insensitive" } },
            ...(digitos && digitos.length >= 3 ? [{ cpf: { contains: digitos } }] : []),
          ],
        },
      });
    }
    if (f.tipoId) e.push({ tipoDocumentoId: f.tipoId });
    if (f.cursoId) {
      // Documento de matrícula: o curso da matrícula; de aluno: qualquer matrícula dele no curso.
      e.push({
        OR: [
          { matricula: { cursoId: f.cursoId } },
          { matriculaId: null, aluno: { matriculas: { some: { cursoId: f.cursoId } } } },
        ],
      });
    }
    if (f.de || f.ate) {
      e.push({
        anexadoEm: {
          ...(f.de ? { gte: new Date(`${f.de}T00:00:00.000-03:00`) } : {}),
          ...(f.ate ? { lte: new Date(`${f.ate}T23:59:59.999-03:00`) } : {}),
        },
      });
    }
    return { AND: e };
  },

  /** Documentos (com arquivo) para o ZIP: por ids ou pelos filtros, limitado a `limite + 1`. */
  paraLote(selecao: { ids?: string[]; filtros?: FiltrosDocumentos }, limite: number) {
    const where: Prisma.DocumentoWhereInput = {
      arquivoChave: { not: null },
      ...(selecao.ids ? { id: { in: selecao.ids } } : this.whereEnviados(selecao.filtros ?? {})),
      ...(selecao.filtros?.situacao && !selecao.ids
        ? { situacaoDeferimento: selecao.filtros.situacao }
        : {}),
    };
    return prisma.documento.findMany({
      where,
      take: limite + 1,
      orderBy: [{ aluno: { nome: "asc" } }, { anexadoEm: "desc" }, { id: "asc" }],
      select: {
        id: true,
        arquivoNome: true,
        arquivoChave: true,
        arquivoTamanho: true,
        tipo: { select: { nome: true } },
        aluno: { select: { nome: true, codigo: true } },
        matricula: { select: { numeroMatricula: true } },
      },
    });
  },

  async listarEnviados({
    situacao,
    skip,
    take,
    ...filtros
  }: FiltrosDocumentos & { skip: number; take: number }) {
    const base = this.whereEnviados(filtros);

    const [data, total, porSituacao] = await Promise.all([
      prisma.documento.findMany({
        where: { ...base, ...(situacao ? { situacaoDeferimento: situacao } : {}) },
        orderBy: [{ anexadoEm: "desc" }, { id: "asc" }],
        skip,
        take,
        include: {
          tipo: { select: { id: true, nome: true, escopo: true } },
          validadoPor: { select: { id: true, nome: true } },
          matricula: { select: { id: true, numeroMatricula: true } },
          aluno: {
            select: {
              id: true,
              codigo: true,
              nome: true,
              cpf: true,
              matriculas: {
                select: { id: true, numeroMatricula: true, curso: { select: { nome: true } } },
                orderBy: { dataMatricula: "desc" },
              },
            },
          },
        },
      }),
      prisma.documento.count({
        where: { ...base, ...(situacao ? { situacaoDeferimento: situacao } : {}) },
      }),
      prisma.documento.groupBy({
        by: ["situacaoDeferimento"],
        where: base,
        _count: { _all: true },
      }),
    ]);

    const totais = { PENDENTE: 0, DEFERIDO: 0, INDEFERIDO: 0 };
    for (const g of porSituacao) totais[g.situacaoDeferimento] = g._count._all;
    return { data, total, totais };
  },

  findTipo(id: string) {
    return prisma.tipoDocumento.findUnique({ where: { id } });
  },

  findMatricula(id: string) {
    return prisma.matricula.findUnique({
      where: { id },
      select: { id: true, alunoId: true, aluno: { select: { id: true, nome: true } } },
    });
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
