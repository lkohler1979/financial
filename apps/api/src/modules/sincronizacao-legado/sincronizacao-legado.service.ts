import { NotFoundError, ValidationError } from "../../shared/errors/app-error";
import { decifrar } from "../../shared/utils/criptografia";
import { registrarAuditoria } from "../auditoria/auditoria.service";
import { configuracoesRepository } from "../configuracoes/configuracoes.repository";
import { matriculasRepository } from "../matriculas/matriculas.repository";
import { LegadoClient } from "./legado-client";
import { reconciliarMatricula } from "./sincronizacao-legado.reconciliador";
import { sincronizacaoLegadoRepository } from "./sincronizacao-legado.repository";

async function montarClient(): Promise<LegadoClient> {
  const config = await configuracoesRepository.obterOuCriar();
  if (!config.legadoUrl || !config.legadoUsuario || !config.legadoSenhaCriptografada) {
    throw new ValidationError(
      "Integração com o sistema legado não configurada — preencha URL, usuário e senha em Configurações",
    );
  }

  return new LegadoClient({
    baseUrl: config.legadoUrl,
    usuario: config.legadoUsuario,
    senha: decifrar(config.legadoSenhaCriptografada),
  });
}

export const sincronizacaoLegadoService = {
  /** Botão manual na ficha de cobrança/matrícula — consulta síncrona, 1 título por Parcela. */
  async sincronizarMatricula(matriculaId: string, usuarioId: string) {
    const matricula = await matriculasRepository.findById(matriculaId);
    if (!matricula) throw new NotFoundError("Matrícula não encontrada");

    const client = await montarClient();
    const resultado = await reconciliarMatricula(matriculaId, (tituloId) =>
      client.buscarInformacoesTitulo(tituloId),
    );

    await sincronizacaoLegadoRepository.registrarExecucao({
      usuarioId,
      tipo: "MANUAL",
      totalConsultados: resultado.tituloConsultados,
      parcelasAtualizadas: resultado.parcelasAtualizadas,
      naoEncontrados: resultado.naoEncontradosNoLegado,
    });

    if (resultado.parcelasAtualizadas > 0) {
      await registrarAuditoria({
        usuarioId,
        entidade: "Parcela",
        entidadeId: matriculaId,
        acao: "ATUALIZACAO",
        detalhes: { origem: "sincronizacao-legado", ...resultado },
      });
    }

    return resultado;
  },

  /**
   * Execução em lote (job agendado ou disparo manual da tela de
   * Configurações) — escopo padrão: matrículas com parcela em atraso.
   */
  async executarLote(tipo: "MANUAL" | "AGENDADA", usuarioId?: string) {
    const client = await montarClient();
    const matriculaIds = await sincronizacaoLegadoRepository.listarMatriculaIdsComParcelaEmAtraso();

    let tituloConsultados = 0;
    let parcelasAtualizadas = 0;
    let naoEncontrados = 0;
    const erros: Array<{ matriculaId: string; mensagem: string }> = [];

    for (const matriculaId of matriculaIds) {
      try {
        const resultado = await reconciliarMatricula(matriculaId, (tituloId) =>
          client.buscarInformacoesTitulo(tituloId),
        );
        tituloConsultados += resultado.tituloConsultados;
        parcelasAtualizadas += resultado.parcelasAtualizadas;
        naoEncontrados += resultado.naoEncontradosNoLegado;
      } catch (err) {
        erros.push({
          matriculaId,
          mensagem: err instanceof Error ? err.message : "Erro desconhecido",
        });
      }
    }

    const execucao = await sincronizacaoLegadoRepository.registrarExecucao({
      usuarioId,
      tipo,
      totalConsultados: tituloConsultados,
      parcelasAtualizadas,
      naoEncontrados,
      erros,
    });

    const ator = usuarioId ?? (await sincronizacaoLegadoRepository.obterUsuarioSistema());
    if (ator) {
      await registrarAuditoria({
        usuarioId: ator,
        entidade: "SincronizacaoLegado",
        entidadeId: execucao.id,
        acao: "CRIACAO",
        detalhes: {
          tipo,
          matriculasConsultadas: matriculaIds.length,
          tituloConsultados,
          parcelasAtualizadas,
          naoEncontrados,
          erros: erros.length,
        },
      });
    }

    return execucao;
  },

  async listarExecucoes(params: { page: number; pageSize: number }) {
    const { data, total } = await sincronizacaoLegadoRepository.listarExecucoes({
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    });
    return { data, total, page: params.page, pageSize: params.pageSize };
  },
};
