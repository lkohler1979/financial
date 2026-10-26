import { Prisma } from "@prisma/client";
import { prisma } from "../../database/prisma";
import { proximoCodigoSequencial } from "../../shared/utils/sequencial";

export type FiltrosMatriculas = Omit<ListarMatriculasParams, "skip" | "take">;

export interface ListarMatriculasParams {
  alunoId?: string;
  cursoId?: string;
  situacao?: string;
  alunoNome?: string;
  alunoCpf?: string;
  dataMatriculaInicio?: Date;
  dataMatriculaFim?: Date;
  situacaoCobrancaId?: string;
  tagId?: string;
  contratoAssinado?: boolean;
  tcdAssinado?: boolean;
  situacaoDocumentacao?: "SEM_DOCUMENTOS" | "DOCUMENTOS_PENDENTES" | "DOCUMENTACAO_COMPLETA";
  skip: number;
  take: number;
}

const incluiAlunoCurso = {
  aluno: {
    select: {
      id: true,
      codigo: true,
      cpf: true,
      nome: true,
      email: true,
      telefone1: true,
      telefone2: true,
    },
  },
  agenteEducacional: { select: { id: true, nome: true } },
  sacado: { select: { id: true, tipoPessoa: true, cpfCnpj: true, nome: true, email: true } },
  curso: { select: { id: true, codigo: true, nome: true } },
  situacaoCobranca: { select: { id: true, nome: true, cor: true } },
  // Usado por matriculasService.gerarParcelas para saber se a matrícula já
  // tem parcelas (geração automática é só pra matrícula ainda sem nenhuma).
  _count: { select: { parcelas: true } },
} satisfies Prisma.MatriculaInclude;

const incluiListaMatriculas = {
  ...incluiAlunoCurso,
  parcelas: { select: { status: true, vencimento: true } },
} satisfies Prisma.MatriculaInclude;

export const matriculasRepository = {
  findById(id: string) {
    return prisma.matricula.findUnique({ where: { id }, include: incluiAlunoCurso });
  },

  findByChaveNatural(alunoId: string, cursoId: string, numeroMatricula: string) {
    return prisma.matricula.findUnique({
      where: {
        alunoId_cursoId_numeroMatricula: { alunoId, cursoId, numeroMatricula },
      },
    });
  },

  /**
   * Busca por aluno+curso, ignorando o número da matrícula — usado pela
   * importação, cuja planilha não traz esse campo (PRD seção 11).
   */
  findByAlunoECurso(alunoId: string, cursoId: string) {
    return prisma.matricula.findFirst({ where: { alunoId, cursoId } });
  },

  /** Todas as matrículas de um aluno, com o curso, em ordem estável. */
  listarPorAluno(alunoId: string) {
    return prisma.matricula.findMany({
      where: { alunoId },
      orderBy: { id: "asc" },
      include: { curso: { select: { id: true, codigo: true, nome: true } } },
    });
  },

  /** Filtros da listagem de matrículas (a mesma regra vale para a busca em lote no legado). */
  whereDaListagem({
    alunoId,
    cursoId,
    situacao,
    alunoNome,
    alunoCpf,
    dataMatriculaInicio,
    dataMatriculaFim,
    situacaoCobrancaId,
    tagId,
    contratoAssinado,
    tcdAssinado,
    situacaoDocumentacao,
  }: FiltrosMatriculas): Prisma.MatriculaWhereInput {
    return {
      ...(alunoId ? { alunoId } : {}),
      ...(cursoId ? { cursoId } : {}),
      ...(situacao ? { situacao: { contains: situacao, mode: "insensitive" } } : {}),
      ...(alunoNome ? { aluno: { nome: { contains: alunoNome, mode: "insensitive" } } } : {}),
      ...(alunoCpf ? { aluno: { cpf: { contains: alunoCpf.replace(/\D/g, "") } } } : {}),
      ...(dataMatriculaInicio || dataMatriculaFim
        ? {
            dataMatricula: {
              ...(dataMatriculaInicio ? { gte: dataMatriculaInicio } : {}),
              ...(dataMatriculaFim ? { lte: dataMatriculaFim } : {}),
            },
          }
        : {}),
      ...(situacaoCobrancaId ? { situacaoCobrancaId } : {}),
      ...(tagId ? { tags: { some: { tagId } } } : {}),
      ...(contratoAssinado !== undefined ? { contratoAssinado } : {}),
      ...(tcdAssinado !== undefined ? { tcdAssinado } : {}),
      ...(situacaoDocumentacao ? { situacaoDocumentacao } : {}),
    };
  },

  /**
   * Alunos (sem repetir) das matrículas escolhidas: por ids marcados na tela ou por todos os que
   * casam com os filtros. Devolve até `limite + 1` para o serviço saber se passou do máximo.
   */
  async alunosDasMatriculas(
    selecao: { ids?: string[]; filtros?: FiltrosMatriculas },
    limite: number,
  ) {
    const where: Prisma.MatriculaWhereInput = selecao.ids
      ? { id: { in: selecao.ids } }
      : this.whereDaListagem(selecao.filtros ?? {});
    const alunos = await prisma.aluno.findMany({
      where: { matriculas: { some: where } },
      select: { id: true, nome: true, cpf: true },
      orderBy: { nome: "asc" },
      take: limite + 1,
    });
    return alunos;
  },

  async list({
    alunoId,
    cursoId,
    situacao,
    alunoNome,
    alunoCpf,
    dataMatriculaInicio,
    dataMatriculaFim,
    situacaoCobrancaId,
    tagId,
    contratoAssinado,
    tcdAssinado,
    situacaoDocumentacao,
    skip,
    take,
  }: ListarMatriculasParams) {
    const where = this.whereDaListagem({
      alunoId,
      cursoId,
      situacao,
      alunoNome,
      alunoCpf,
      dataMatriculaInicio,
      dataMatriculaFim,
      situacaoCobrancaId,
      tagId,
      contratoAssinado,
      tcdAssinado,
      situacaoDocumentacao,
    });

    const [data, total] = await Promise.all([
      prisma.matricula.findMany({
        where,
        skip,
        take,
        orderBy: { dataMatricula: "desc" },
        include: incluiListaMatriculas,
      }),
      prisma.matricula.count({ where }),
    ]);

    return { data, total };
  },

  // Número da matrícula = AAAA + 5 dígitos, gerado aqui (e não no service)
  // para valer também nas matrículas criadas pelas importações; um número
  // já informado (ex.: vindo do legado) é respeitado.
  async create(data: Prisma.MatriculaCreateInput) {
    const numeroMatricula =
      data.numeroMatricula ??
      (await proximoCodigoSequencial(
        "MATRICULA",
        (data.dataMatricula as Date | undefined) ?? new Date(),
      ));
    return prisma.matricula.create({
      data: { ...data, numeroMatricula },
      include: incluiAlunoCurso,
    });
  },

  update(id: string, data: Prisma.MatriculaUpdateInput) {
    return prisma.matricula.update({ where: { id }, data, include: incluiAlunoCurso });
  },

  /** Cobranças já emitidas (boleto/Pix) e ainda em aberto — ficam no nome do sacado de antes. */
  countCobrancasEmitidasEmAberto(matriculaId: string) {
    return prisma.parcela.count({
      where: { matriculaId, status: "EM_ABERTO", asaasPaymentId: { not: null } },
    });
  },

  delete(id: string) {
    return prisma.matricula.delete({ where: { id } });
  },

  /** Usuários ativos que podem ser agente educacional — só id/nome. */
  listarAgentes() {
    return prisma.usuario.findMany({
      where: { ativo: true },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    });
  },

  countParcelas(matriculaId: string) {
    return prisma.parcela.count({ where: { matriculaId } });
  },
};
