import fs from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { registrarAuditoria } from "../auditoria/auditoria.service";
import { criptografar } from "../../shared/utils/criptografia";
import { reprogramarSincronizacaoAgendada } from "../../jobs/queues/sincronizacao-legado.queue";
import { configuracoesRepository } from "./configuracoes.repository";
import type { AtualizarConfiguracaoInput } from "./configuracoes.schema";

const ENTIDADE = "Configuracao";

function serializarConfiguracao(configuracao: {
  id: string;
  diasAtraso: number;
  pastaSaidaDocumentos: string;
  modeloDocx: string;
  padraoNomeArquivo: string;
  frequenciaImportacao: "MANUAL" | "SEMANAL" | "MENSAL";
  multaPercentual: Prisma.Decimal | number;
  jurosDiarioPercentual: Prisma.Decimal | number;
  jurosContarDiaGeracao: boolean;
  tipoTituloProtestoDefault: "MENSALIDADE" | "RENEGOCIACAO" | "AMBOS";
  legadoSincronizacaoAtiva: boolean;
  legadoUrl: string | null;
  legadoUsuario: string | null;
  legadoSenhaCriptografada: string | null;
  legadoIntervaloHoras: number;
}) {
  // A senha criptografada nunca sai da API — só um indicador se já foi definida.
  const { legadoSenhaCriptografada, ...resto } = configuracao;
  return {
    ...resto,
    multaPercentual: Number(configuracao.multaPercentual),
    jurosDiarioPercentual: Number(configuracao.jurosDiarioPercentual),
    legadoSenhaConfigurada: Boolean(legadoSenhaCriptografada),
  };
}

export const configuracoesService = {
  async obter() {
    const configuracao = await configuracoesRepository.obterOuCriar();
    return serializarConfiguracao(configuracao);
  },

  async atualizar(input: AtualizarConfiguracaoInput, usuarioId: string) {
    const atual = await configuracoesRepository.obterOuCriar();
    const dados: Prisma.ConfiguracaoUpdateInput = {
      ...(input.frequenciaImportacao !== undefined
        ? { frequenciaImportacao: input.frequenciaImportacao }
        : {}),
      ...(input.diasAtraso !== undefined ? { diasAtraso: input.diasAtraso } : {}),
      ...(input.pastaSaidaDocumentos !== undefined
        ? { pastaSaidaDocumentos: input.pastaSaidaDocumentos }
        : {}),
      ...(input.modeloDocx !== undefined ? { modeloDocx: input.modeloDocx } : {}),
      ...(input.padraoNomeArquivo !== undefined
        ? { padraoNomeArquivo: input.padraoNomeArquivo }
        : {}),
      ...(input.multaPercentual !== undefined ? { multaPercentual: input.multaPercentual } : {}),
      ...(input.jurosDiarioPercentual !== undefined
        ? { jurosDiarioPercentual: input.jurosDiarioPercentual }
        : {}),
      ...(input.jurosContarDiaGeracao !== undefined
        ? { jurosContarDiaGeracao: input.jurosContarDiaGeracao }
        : {}),
      ...(input.tipoTituloProtestoDefault !== undefined
        ? { tipoTituloProtestoDefault: input.tipoTituloProtestoDefault }
        : {}),
      ...(input.legadoSincronizacaoAtiva !== undefined
        ? { legadoSincronizacaoAtiva: input.legadoSincronizacaoAtiva }
        : {}),
      ...(input.legadoUrl !== undefined ? { legadoUrl: input.legadoUrl } : {}),
      ...(input.legadoUsuario !== undefined ? { legadoUsuario: input.legadoUsuario } : {}),
      ...(input.legadoSenha !== undefined
        ? { legadoSenhaCriptografada: criptografar(input.legadoSenha) }
        : {}),
      ...(input.legadoIntervaloHoras !== undefined
        ? { legadoIntervaloHoras: input.legadoIntervaloHoras }
        : {}),
    };

    const configuracao = await configuracoesRepository.atualizar(dados);

    // Nunca loga a senha em texto puro na Auditoria, só quais campos mudaram.
    await registrarAuditoria({
      usuarioId,
      entidade: ENTIDADE,
      entidadeId: atual.id,
      acao: "ATUALIZACAO",
      detalhes: { camposAlterados: Object.keys(input).filter((campo) => campo !== "legadoSenha") },
    });

    if (input.legadoSincronizacaoAtiva !== undefined || input.legadoIntervaloHoras !== undefined) {
      await reprogramarSincronizacaoAgendada(
        configuracao.legadoSincronizacaoAtiva,
        configuracao.legadoIntervaloHoras,
      );
    }

    return serializarConfiguracao(configuracao);
  },

  /**
   * Limpa a base para uma importação real do zero (pedido do usuário,
   * 2026-07-08). A confirmação por frase exata já foi validada pelo Zod
   * (controller) antes de chegar aqui. Apaga também os documentos .docx/.pdf
   * já gerados em disco (best-effort — igual a `relatoriosService.excluir`).
   */
  async limparBase(usuarioId: string) {
    const resultado = await configuracoesRepository.limparDadosTransacionais();

    for (const relatorio of resultado.relatoriosAntesDaExclusao) {
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
            // Arquivo já removido/indisponível — não impede a limpeza.
          }
        }
      }
    }

    await registrarAuditoria({
      usuarioId,
      entidade: "BaseDados",
      entidadeId: "limpeza-geral",
      acao: "EXCLUSAO",
      detalhes: resultado.contagens as unknown as Prisma.InputJsonValue,
    });

    return resultado.contagens;
  },
};
