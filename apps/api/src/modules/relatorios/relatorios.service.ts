import fs from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { NotFoundError } from "../../shared/errors/app-error";
import { registrarAuditoria } from "../auditoria/auditoria.service";
import { configuracoesRepository } from "../configuracoes/configuracoes.repository";
import { geracaoWordQueue } from "../../jobs/queues/geracao-word.queue";
import { ConfiguracaoFinanceira } from "./calculo-financeiro";
import { MatriculaElegivel, relatoriosRepository } from "./relatorios.repository";
import type {
  FiltrosElegibilidadeInput,
  GerarRelatorioInput,
  ListarRelatoriosInput,
} from "./relatorios.schema";

interface FiltrosResolvidos {
  diasAtraso: number;
  valorMinimo?: number;
  cursoId?: string;
  situacaoCobrancaId?: string;
  tagId?: string;
  ignorarSituacoesTratadas: boolean;
  financeiro: ConfiguracaoFinanceira;
}

// Único critério de elegibilidade por atraso (decisão do usuário,
// 2026-07-06): "parcelas mínimas vencidas" foi removido — dias de atraso já
// basta para detectar parcela atrasada ou não.
async function resolverFiltros(filtros: FiltrosElegibilidadeInput): Promise<FiltrosResolvidos> {
  const configuracao = await configuracoesRepository.obterOuCriar();
  return {
    diasAtraso: filtros.diasAtraso ?? configuracao.diasAtraso,
    valorMinimo: filtros.valorMinimo,
    cursoId: filtros.cursoId,
    situacaoCobrancaId: filtros.situacaoCobrancaId,
    tagId: filtros.tagId,
    ignorarSituacoesTratadas: filtros.ignorarSituacoesTratadas,
    financeiro: {
      multaPercentual: Number(configuracao.multaPercentual),
      jurosDiarioPercentual: Number(configuracao.jurosDiarioPercentual),
      jurosContarDiaGeracao: configuracao.jurosContarDiaGeracao,
    },
  };
}

function aplicarElegibilidade(
  candidatos: MatriculaElegivel[],
  filtros: FiltrosResolvidos,
): MatriculaElegivel[] {
  return candidatos.filter((candidato) => {
    if (filtros.diasAtraso > 0 && candidato.diasAtrasoMaximo < filtros.diasAtraso) {
      return false;
    }
    if (filtros.valorMinimo !== undefined && candidato.valorTotal < filtros.valorMinimo) {
      return false;
    }
    return true;
  });
}

export const relatoriosService = {
  /** Prévia síncrona dos elegíveis, para a tela de geração revisar/selecionar antes de disparar o Word em lote. */
  async previaElegiveis(filtrosInput: FiltrosElegibilidadeInput): Promise<MatriculaElegivel[]> {
    const filtros = await resolverFiltros(filtrosInput);
    const candidatos = await relatoriosRepository.buscarMatriculasComParcelasVencidas(
      filtros.cursoId,
      filtros.financeiro,
      {
        situacaoCobrancaId: filtros.situacaoCobrancaId,
        tagId: filtros.tagId,
        ignorarSituacoesTratadas: filtros.ignorarSituacoesTratadas,
      },
      filtros.diasAtraso,
    );
    return aplicarElegibilidade(candidatos, filtros);
  },

  async gerar(input: GerarRelatorioInput, usuarioId: string) {
    const filtros = await resolverFiltros(input);
    let elegiveis = await relatoriosRepository.buscarMatriculasComParcelasVencidas(
      filtros.cursoId,
      filtros.financeiro,
      {
        situacaoCobrancaId: filtros.situacaoCobrancaId,
        tagId: filtros.tagId,
        ignorarSituacoesTratadas: filtros.ignorarSituacoesTratadas,
      },
      filtros.diasAtraso,
    );
    elegiveis = aplicarElegibilidade(elegiveis, filtros);

    if (input.matriculaIds && input.matriculaIds.length > 0) {
      const selecionados = new Set(input.matriculaIds);
      elegiveis = elegiveis.filter((candidato) => selecionados.has(candidato.matriculaId));
    }

    const dados: Prisma.RelatorioInadimplenciaCreateInput = {
      usuario: { connect: { id: usuarioId } },
      diasAtraso: filtros.diasAtraso || null,
      incluirParcelasVencidasRecentes: input.incluirParcelasVencidasRecentes,
      valorMinimo: filtros.valorMinimo,
      ...(filtros.cursoId ? { curso: { connect: { id: filtros.cursoId } } } : {}),
      totalElegiveis: elegiveis.length,
      itens: elegiveis.map((candidato) => ({ ...candidato, documentoGerado: false })),
    };

    const relatorio = await relatoriosRepository.create(dados);

    await registrarAuditoria({
      usuarioId,
      entidade: "RelatorioInadimplencia",
      entidadeId: relatorio.id,
      acao: "CRIACAO",
      detalhes: { totalElegiveis: elegiveis.length, filtros } as unknown as Prisma.InputJsonValue,
    });

    let jobId: string | undefined;
    if (elegiveis.length > 0) {
      const job = await geracaoWordQueue.add("gerar-relatorio", { relatorioId: relatorio.id });
      jobId = job?.id;
    }

    return { ...relatorio, jobId };
  },

  async statusJob(jobId: string) {
    const job = await geracaoWordQueue.getJob(jobId);
    if (!job) throw new NotFoundError("Job de geração não encontrado");

    const estado = await job.getState();

    return {
      jobId: job.id,
      estado,
      progresso: typeof job.progress === "number" ? job.progress : 0,
      erro: estado === "failed" ? job.failedReason : undefined,
    };
  },

  async listar(params: ListarRelatoriosInput) {
    const { page, pageSize } = params;
    const { data, total } = await relatoriosRepository.list({
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { data, total, page, pageSize };
  },

  async buscarPorId(id: string) {
    const relatorio = await relatoriosRepository.findById(id);
    if (!relatorio) throw new NotFoundError("Relatório não encontrado");
    return relatorio;
  },

  /** Último documento já gerado para a matrícula (qualquer relatório), ou
   * `null` se nunca foi gerado — usado quando não há mais parcela elegível
   * (ex.: já protestada por completo) para oferecer o documento existente
   * em vez de simplesmente falhar. */
  buscarUltimoDocumentoGeradoPorMatricula(matriculaId: string) {
    return relatoriosRepository.buscarUltimoDocumentoGeradoPorMatricula(matriculaId);
  },

  /**
   * Exclui o registro do histórico e os documentos (.docx/.pdf) gerados por
   * ele em disco. Diferente de Aluno/Matrícula/Parcela (append-first, PRD
   * seção 12), o histórico de relatórios não guarda regra de negócio — só
   * uma cópia dos documentos já gerados — por isso a exclusão é permitida
   * (pedido do usuário, 2026-07-07). Remoção dos arquivos é best-effort: um
   * arquivo já ausente em disco não impede a exclusão do registro.
   */
  async excluir(id: string, usuarioId: string) {
    const relatorio = await this.buscarPorId(id);

    const itens = Array.isArray(relatorio.itens)
      ? (relatorio.itens as unknown as Array<{
          caminhoDocumento?: string | null;
          caminhoDocumentoPdf?: string | null;
        }>)
      : [];

    for (const item of itens) {
      for (const caminho of [item.caminhoDocumento, item.caminhoDocumentoPdf]) {
        if (!caminho) continue;
        try {
          fs.unlinkSync(path.resolve(caminho));
        } catch {
          // Arquivo já removido/indisponível — não impede a exclusão do registro.
        }
      }
    }

    await relatoriosRepository.delete(id);

    await registrarAuditoria({
      usuarioId,
      entidade: "RelatorioInadimplencia",
      entidadeId: id,
      acao: "EXCLUSAO",
      detalhes: { totalDocumentosGerados: relatorio.totalDocumentosGerados },
    });
  },
};
