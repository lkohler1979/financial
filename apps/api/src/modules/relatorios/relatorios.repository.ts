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

/**
 * Data-limite de vencimento para considerar uma parcela "vencida há mais de
 * X dias" (Configuracao.diasAtraso). Com diasAtrasoMinimo <= 0 (não
 * configurado), mantém o comportamento anterior: qualquer parcela vencida.
 */
function dataLimiteAtraso(hoje: Date, diasAtrasoMinimo: number): Date {
  if (diasAtrasoMinimo <= 0) return hoje;
  const limite = new Date(hoje);
  limite.setDate(limite.getDate() - diasAtrasoMinimo);
  return limite;
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
  situacaoCobrancaId: string | null;
  situacaoCobrancaNome: string | null;
  tags: Array<{ id: string; nome: string }>;
}

export interface ListarRelatoriosParams {
  skip: number;
  take: number;
}

export interface FiltrosCobrancaElegibilidade {
  situacaoCobrancaId?: string;
  tagId?: string;
  /** true (padrão): exclui matrículas cuja situação atual tem participaNovosRelatorios=false (PRD seção 23.6). */
  ignorarSituacoesTratadas: boolean;
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
    filtrosCobranca: FiltrosCobrancaElegibilidade,
    diasAtrasoMinimo: number,
  ): Promise<MatriculaElegivel[]> {
    const hoje = inicioHoje();
    const limiteVencimento = dataLimiteAtraso(hoje, diasAtrasoMinimo);

    const matriculas = await prisma.matricula.findMany({
      where: {
        ...(cursoId ? { cursoId } : {}),
        ...(filtrosCobranca.situacaoCobrancaId
          ? { situacaoCobrancaId: filtrosCobranca.situacaoCobrancaId }
          : {}),
        ...(filtrosCobranca.tagId ? { tags: { some: { tagId: filtrosCobranca.tagId } } } : {}),
        ...(filtrosCobranca.ignorarSituacoesTratadas
          ? {
              OR: [
                { situacaoCobrancaId: null },
                {
                  situacaoCobranca: {
                    participaNovosRelatorios: true,
                    NOT: { nome: { equals: "Quitado", mode: "insensitive" } },
                  },
                },
              ],
            }
          : {}),
        parcelas: { some: { status: "EM_ABERTO", vencimento: { lt: limiteVencimento } } },
      },
      include: {
        aluno: { select: { id: true, nome: true, cpf: true } },
        curso: { select: { id: true, nome: true } },
        parcelas: { where: { status: "EM_ABERTO", vencimento: { lt: limiteVencimento } } },
        situacaoCobranca: { select: { id: true, nome: true } },
        tags: { select: { tag: { select: { id: true, nome: true } } } },
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
        situacaoCobrancaId: matricula.situacaoCobranca?.id ?? null,
        situacaoCobrancaNome: matricula.situacaoCobranca?.nome ?? null,
        tags: matricula.tags.map((associacao) => associacao.tag),
      };
    });
  },

  findById(id: string) {
    return prisma.relatorioInadimplencia.findUnique({ where: { id } });
  },

  /**
   * Último documento já gerado para uma matrícula, em qualquer relatório
   * (mais recente primeiro) — usado quando o usuário tenta gerar de novo
   * para uma matrícula que não tem mais parcela elegível (ex.: já protestada
   * por completo), para oferecer o documento existente em vez de falhar
   * silenciosamente. `itens` é JSON (sem índice), então filtramos em
   * memória — a query já reduz ao mínimo com `totalDocumentosGerados > 0`.
   */
  async buscarUltimoDocumentoGeradoPorMatricula(matriculaId: string) {
    const relatorios = await prisma.relatorioInadimplencia.findMany({
      where: { totalDocumentosGerados: { gt: 0 } },
      orderBy: { data: "desc" },
      select: { id: true, itens: true },
    });

    for (const relatorio of relatorios) {
      const itens = Array.isArray(relatorio.itens)
        ? (relatorio.itens as unknown as Array<{
            matriculaId: string;
            documentoGerado?: boolean;
            caminhoDocumento?: string | null;
            caminhoDocumentoPdf?: string | null;
          }>)
        : [];
      const item = itens.find((i) => i.matriculaId === matriculaId && i.documentoGerado);
      if (item) {
        return {
          relatorioId: relatorio.id,
          temDocx: Boolean(item.caminhoDocumento),
          temPdf: Boolean(item.caminhoDocumentoPdf),
        };
      }
    }

    return null;
  },

  /**
   * Parcelas vencidas de uma matrícula, para montar a tabela do documento de
   * protesto — só as vencidas há mais de `diasAtrasoMinimo` dias
   * (Configuracao.diasAtraso), mesmo critério usado para levantar os elegíveis.
   */
  buscarParcelasVencidasDaMatricula(matriculaId: string, diasAtrasoMinimo = 0) {
    const hoje = inicioHoje();
    const limiteVencimento = dataLimiteAtraso(hoje, diasAtrasoMinimo);
    return prisma.parcela.findMany({
      where: { matriculaId, status: "EM_ABERTO", vencimento: { lt: limiteVencimento } },
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

  delete(id: string) {
    return prisma.relatorioInadimplencia.delete({ where: { id } });
  },
};
