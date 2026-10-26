import { Prisma } from "@prisma/client";
import { prisma } from "../../database/prisma";
import {
  inicioDeHoje,
  STATUS_PARCELA_DEVENDO as STATUS_DEVENDO,
} from "../../shared/utils/parcelas-vencidas";
import { proximoCodigoSequencial } from "../../shared/utils/sequencial";

export type SituacaoFinanceiraAluno = "EM_DIA" | "EM_ATRASO" | "SEM_MATRICULA";

export interface ListarAlunosParams {
  busca?: string;
  /** Só alunos nesta situação financeira (ver `situacaoFinanceira`). */
  situacao?: SituacaoFinanceiraAluno;
  /** Só alunos com matrícula neste curso. */
  cursoId?: string;
  skip: number;
  take: number;
}

/** Aluno com alguma parcela devendo e já vencida (vencimento antes de hoje). */
function comParcelaVencida(hoje: Date): Prisma.AlunoWhereInput {
  return {
    matriculas: {
      some: {
        parcelas: { some: { status: { in: [...STATUS_DEVENDO] }, vencimento: { lt: hoje } } },
      },
    },
  };
}

/**
 * Situação financeira: sem matrícula; em atraso (parcela devendo e vencida em alguma matrícula);
 * ou em dia (tem matrícula e nenhuma parcela vencida e não paga).
 */
function whereDaSituacao(situacao: SituacaoFinanceiraAluno, hoje: Date): Prisma.AlunoWhereInput {
  switch (situacao) {
    case "SEM_MATRICULA":
      return { matriculas: { none: {} } };
    case "EM_ATRASO":
      return comParcelaVencida(hoje);
    case "EM_DIA":
      return { matriculas: { some: {} }, NOT: comParcelaVencida(hoje) };
  }
}

export interface ResumoDoAluno {
  totalMatriculas: number;
  /** A matrícula mais recente (pela data; sem data, a de código mais novo). */
  ultimaMatricula: { id: string; cursoNome: string; dataMatricula: Date | null } | null;
  situacaoFinanceira: SituacaoFinanceiraAluno;
}

export const alunosRepository = {
  findById(id: string) {
    return prisma.aluno.findUnique({ where: { id } });
  },

  findByCpf(cpf: string) {
    return prisma.aluno.findUnique({ where: { cpf } });
  },

  async list({ busca, situacao, cursoId, skip, take }: ListarAlunosParams, agora = new Date()) {
    const hoje = inicioDeHoje(agora);
    const cpfBusca = busca?.replace(/\D/g, "");
    const filtros: Prisma.AlunoWhereInput[] = [];
    if (busca) {
      filtros.push({
        OR: [
          { nome: { contains: busca, mode: "insensitive" } },
          { email: { contains: busca, mode: "insensitive" } },
          { codigo: { contains: busca } },
          ...(cpfBusca ? [{ cpf: { contains: cpfBusca } }] : []),
        ],
      });
    }
    if (situacao) filtros.push(whereDaSituacao(situacao, hoje));
    if (cursoId) filtros.push({ matriculas: { some: { cursoId } } });
    const where: Prisma.AlunoWhereInput = filtros.length ? { AND: filtros } : {};

    const [alunos, total] = await Promise.all([
      prisma.aluno.findMany({ where, skip, take, orderBy: { nome: "asc" } }),
      prisma.aluno.count({ where }),
    ]);

    const resumos = await this.resumosDosAlunos(
      alunos.map((a) => a.id),
      agora,
    );
    return { data: alunos.map((a) => ({ ...a, ...resumos.get(a.id)! })), total };
  },

  /** Total de matrículas, matrícula mais recente e situação financeira de cada aluno informado. */
  async resumosDosAlunos(
    alunoIds: string[],
    agora = new Date(),
  ): Promise<Map<string, ResumoDoAluno>> {
    const hoje = inicioDeHoje(agora);
    const resumos = new Map<string, ResumoDoAluno>(
      alunoIds.map((id) => [
        id,
        { totalMatriculas: 0, ultimaMatricula: null, situacaoFinanceira: "SEM_MATRICULA" },
      ]),
    );
    if (alunoIds.length === 0) return resumos;

    const [matriculas, emAtraso] = await Promise.all([
      prisma.matricula.findMany({
        where: { alunoId: { in: alunoIds } },
        select: {
          id: true,
          alunoId: true,
          dataMatricula: true,
          curso: { select: { nome: true } },
        },
        orderBy: [{ dataMatricula: { sort: "desc", nulls: "last" } }, { id: "desc" }],
      }),
      prisma.matricula.findMany({
        where: {
          alunoId: { in: alunoIds },
          parcelas: { some: { status: { in: [...STATUS_DEVENDO] }, vencimento: { lt: hoje } } },
        },
        select: { alunoId: true },
      }),
    ]);
    const atrasados = new Set(emAtraso.map((m) => m.alunoId));

    for (const m of matriculas) {
      const r = resumos.get(m.alunoId)!;
      r.totalMatriculas += 1;
      // A lista vem da mais recente para a mais antiga: a primeira de cada aluno é a última.
      r.ultimaMatricula ??= { id: m.id, cursoNome: m.curso.nome, dataMatricula: m.dataMatricula };
      r.situacaoFinanceira = atrasados.has(m.alunoId) ? "EM_ATRASO" : "EM_DIA";
    }
    return resumos;
  },

  /** Quantas parcelas devendo e já vencidas o aluno tem, somando todas as matrículas. */
  contarParcelasVencidas(alunoId: string, agora = new Date()) {
    return prisma.parcela.count({
      where: {
        matricula: { alunoId },
        status: { in: [...STATUS_DEVENDO] },
        vencimento: { lt: inicioDeHoje(agora) },
      },
    });
  },

  /** Contadores do topo da lista de alunos. */
  async contadores(agora = new Date()) {
    const hoje = inicioDeHoje(agora);
    const [total, comMatricula, comPendencias] = await Promise.all([
      prisma.aluno.count(),
      prisma.aluno.count({ where: { matriculas: { some: {} } } }),
      prisma.aluno.count({ where: comParcelaVencida(hoje) }),
    ]);
    return { total, comMatricula, semMatricula: total - comMatricula, comPendencias };
  },

  // Todo aluno nasce com código (AAAA+5 dígitos), inclusive os criados pelas
  // importações — por isso a geração fica aqui e não no service.
  async create(data: Prisma.AlunoCreateInput) {
    const codigo = data.codigo ?? (await proximoCodigoSequencial("ALUNO"));
    return prisma.aluno.create({ data: { ...data, codigo } });
  },

  update(id: string, data: Prisma.AlunoUpdateInput) {
    return prisma.aluno.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.aluno.delete({ where: { id } });
  },

  countMatriculas(alunoId: string) {
    return prisma.matricula.count({ where: { alunoId } });
  },
};
