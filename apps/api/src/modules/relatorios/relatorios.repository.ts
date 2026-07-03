import { Prisma } from "@prisma/client";
import { prisma } from "../../database/prisma";
import {
  calcularDiasAtraso,
  calcularMultaJuros,
  ConfiguracaoFinanceira,
} from "./calculo-financeiro";

function inicioHoje(): Date {
  const agora = new Date();
  return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
}

export interface MatriculaElegivel {
  matriculaId: string;
  alunoId: string;
  alunoNome: string;
  alunoCpf: string;
  cursoId: string;
  cursoNome: string;
  quantidadeParcelasVencidas: number;
  diasAtrasoMaximo: number;
  /** Soma de Parcela.valor das parcelas vencidas, sem multa/juros. */
  valorBruto: number;
  /** Valor bruto + multa + juros (o que efetivamente vai para o documento de protesto). */
  valorTotal: number;
}

export interface ListarRelatoriosParams {
  skip: number;
  take: number;
}

export const relatoriosRepository = {
  /**
   * Matrículas com ao menos uma parcela EM_ABERTO vencida, já com os totais
   * agregados (quantidade, dias de atraso máximo, valor total vencido). A
   * aplicação dos critérios de elegibilidade (seção 15/23 do PRD) fica no
   * service — aqui só levantamos os candidatos.
   */
  async buscarMatriculasComParcelasVencidas(
    cursoId: string | undefined,
    configFinanceira: ConfiguracaoFinanceira,
  ): Promise<MatriculaElegivel[]> {
    const hoje = inicioHoje();

    const matriculas = await prisma.matricula.findMany({
      where: {
        ...(cursoId ? { cursoId } : {}),
        parcelas: { some: { status: "EM_ABERTO", vencimento: { lt: hoje } } },
      },
      include: {
        aluno: { select: { id: true, nome: true, cpf: true } },
        curso: { select: { id: true, nome: true } },
        parcelas: { where: { status: "EM_ABERTO", vencimento: { lt: hoje } } },
      },
    });

    return matriculas.map((matricula) => {
      const parcelasVencidas = matricula.parcelas;
      const diasAtrasoMaximo = Math.max(
        ...parcelasVencidas.map((p) =>
          calcularDiasAtraso(p.vencimento, hoje, configFinanceira.jurosContarDiaGeracao),
        ),
      );
      const calculos = parcelasVencidas.map((p) =>
        calcularMultaJuros(
          Number(p.valor),
          calcularDiasAtraso(p.vencimento, hoje, configFinanceira.jurosContarDiaGeracao),
          configFinanceira,
        ),
      );
      const valorBruto = calculos.reduce((soma, c) => soma + c.valorBruto, 0);
      const valorTotal = calculos.reduce((soma, c) => soma + c.total, 0);

      return {
        matriculaId: matricula.id,
        alunoId: matricula.aluno.id,
        alunoNome: matricula.aluno.nome,
        alunoCpf: matricula.aluno.cpf,
        cursoId: matricula.curso.id,
        cursoNome: matricula.curso.nome,
        quantidadeParcelasVencidas: parcelasVencidas.length,
        diasAtrasoMaximo,
        valorBruto,
        valorTotal,
      };
    });
  },

  findById(id: string) {
    return prisma.relatorioInadimplencia.findUnique({ where: { id } });
  },

  /** Parcelas vencidas de uma matrícula, para montar a tabela do documento de protesto. */
  buscarParcelasVencidasDaMatricula(matriculaId: string) {
    const hoje = inicioHoje();
    return prisma.parcela.findMany({
      where: { matriculaId, status: "EM_ABERTO", vencimento: { lt: hoje } },
      orderBy: { vencimento: "asc" },
    });
  },

  async list({ skip, take }: ListarRelatoriosParams) {
    const [data, total] = await Promise.all([
      prisma.relatorioInadimplencia.findMany({
        skip,
        take,
        orderBy: { data: "desc" },
        include: { curso: { select: { id: true, nome: true } } },
      }),
      prisma.relatorioInadimplencia.count(),
    ]);
    return { data, total };
  },

  create(data: Prisma.RelatorioInadimplenciaCreateInput) {
    return prisma.relatorioInadimplencia.create({ data });
  },

  update(id: string, data: Prisma.RelatorioInadimplenciaUpdateInput) {
    return prisma.relatorioInadimplencia.update({ where: { id }, data });
  },
};
