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
  parcelasMinimas: number;
  diasAtraso: number;
  valorMinimo?: number;
  cursoId?: string;
  financeiro: ConfiguracaoFinanceira;
}

// "Só considerar a condição preenchida" (decisão do usuário, 2026-07-03, ver
// PENDENCIAS.md): cada critério só é exigido quando > 0; se os dois vierem
// preenchidos na mesma geração, ambos precisam ser satisfeitos (E).
async function resolverFiltros(filtros: FiltrosElegibilidadeInput): Promise<FiltrosResolvidos> {
  const configuracao = await configuracoesRepository.obterOuCriar();
  return {
    parcelasMinimas: filtros.parcelasMinimas ?? configuracao.parcelasMinimas,
    diasAtraso: filtros.diasAtraso ?? configuracao.diasAtraso,
    valorMinimo: filtros.valorMinimo,
    cursoId: filtros.cursoId,
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
    if (
      filtros.parcelasMinimas > 0 &&
      candidato.quantidadeParcelasVencidas < filtros.parcelasMinimas
    ) {
      return false;
    }
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
    );
    return aplicarElegibilidade(candidatos, filtros);
  },

  async gerar(input: GerarRelatorioInput, usuarioId: string) {
    const filtros = await resolverFiltros(input);
    let elegiveis = await relatoriosRepository.buscarMatriculasComParcelasVencidas(
      filtros.cursoId,
      filtros.financeiro,
    );
    elegiveis = aplicarElegibilidade(elegiveis, filtros);

    if (input.matriculaIds && input.matriculaIds.length > 0) {
      const selecionados = new Set(input.matriculaIds);
      elegiveis = elegiveis.filter((candidato) => selecionados.has(candidato.matriculaId));
    }

    const dados: Prisma.RelatorioInadimplenciaCreateInput = {
      usuario: { connect: { id: usuarioId } },
      parcelasMinimas: filtros.parcelasMinimas || null,
      diasAtraso: filtros.diasAtraso || null,
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
      detalhes: { totalElegiveis: elegiveis.length, filtros },
    });

    if (elegiveis.length > 0) {
      await geracaoWordQueue.add("gerar-relatorio", { relatorioId: relatorio.id });
    }

    return relatorio;
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
};
