import fs from "node:fs";
import path from "node:path";
import { PagamentoProvedor, Prisma } from "@prisma/client";
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
  asaasAmbiente: "SANDBOX" | "PRODUCAO";
  asaasApiKeyCriptografada: string | null;
  asaasWebhookTokenCriptografado: string | null;
  asaasMultaPercentual: Prisma.Decimal | number | null;
  asaasJurosMensalPercentual: Prisma.Decimal | number | null;
  asaasDescontoPercentual: Prisma.Decimal | number | null;
  asaasDescontoDiasAntesVencimento: number | null;
  emissaoAntecipadaDias: number;
  redeCartaoMaxParcelas: number;
  nfseAtiva: boolean;
  nfseDiaLimite: number;
  nfseServicoCodigo: string;
  nfseServicoNome: string;
  nfseServicoDescricao: string;
  nfseMunicipalServiceId: string | null;
  nfseIssPercentual: Prisma.Decimal | number;
  provedorBoleto: PagamentoProvedor | null;
  provedorPix: PagamentoProvedor | null;
  provedorCartao: PagamentoProvedor | null;
  redeAmbiente: "SANDBOX" | "PRODUCAO";
  redePvCriptografado: string | null;
  redeChaveIntegracaoCriptografada: string | null;
  redeWebhookTokenCriptografado: string | null;
}) {
  // A senha/API key/token/chave criptografados nunca saem da API — só um
  // indicador se já foram definidos.
  const {
    legadoSenhaCriptografada,
    asaasApiKeyCriptografada,
    asaasWebhookTokenCriptografado,
    redePvCriptografado,
    redeChaveIntegracaoCriptografada,
    redeWebhookTokenCriptografado,
    ...resto
  } = configuracao;
  return {
    ...resto,
    multaPercentual: Number(configuracao.multaPercentual),
    jurosDiarioPercentual: Number(configuracao.jurosDiarioPercentual),
    asaasMultaPercentual:
      configuracao.asaasMultaPercentual != null ? Number(configuracao.asaasMultaPercentual) : null,
    asaasJurosMensalPercentual:
      configuracao.asaasJurosMensalPercentual != null
        ? Number(configuracao.asaasJurosMensalPercentual)
        : null,
    asaasDescontoPercentual:
      configuracao.asaasDescontoPercentual != null
        ? Number(configuracao.asaasDescontoPercentual)
        : null,
    legadoSenhaConfigurada: Boolean(legadoSenhaCriptografada),
    asaasApiKeyConfigurada: Boolean(asaasApiKeyCriptografada),
    asaasWebhookTokenConfigurado: Boolean(asaasWebhookTokenCriptografado),
    redePvConfigurado: Boolean(redePvCriptografado),
    redeChaveIntegracaoConfigurada: Boolean(redeChaveIntegracaoCriptografada),
    redeWebhookTokenConfigurado: Boolean(redeWebhookTokenCriptografado),
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
      ...(input.asaasAmbiente !== undefined ? { asaasAmbiente: input.asaasAmbiente } : {}),
      ...(input.asaasApiKey !== undefined
        ? { asaasApiKeyCriptografada: criptografar(input.asaasApiKey) }
        : {}),
      ...(input.asaasWebhookToken !== undefined
        ? { asaasWebhookTokenCriptografado: criptografar(input.asaasWebhookToken) }
        : {}),
      ...(input.provedorBoleto !== undefined ? { provedorBoleto: input.provedorBoleto } : {}),
      ...(input.provedorPix !== undefined ? { provedorPix: input.provedorPix } : {}),
      ...(input.provedorCartao !== undefined ? { provedorCartao: input.provedorCartao } : {}),
      ...(input.redeAmbiente !== undefined ? { redeAmbiente: input.redeAmbiente } : {}),
      ...(input.redePv !== undefined ? { redePvCriptografado: criptografar(input.redePv) } : {}),
      ...(input.redeChaveIntegracao !== undefined
        ? { redeChaveIntegracaoCriptografada: criptografar(input.redeChaveIntegracao) }
        : {}),
      ...(input.redeWebhookToken !== undefined
        ? { redeWebhookTokenCriptografado: criptografar(input.redeWebhookToken) }
        : {}),
      ...(input.asaasMultaPercentual !== undefined
        ? { asaasMultaPercentual: input.asaasMultaPercentual }
        : {}),
      ...(input.asaasJurosMensalPercentual !== undefined
        ? { asaasJurosMensalPercentual: input.asaasJurosMensalPercentual }
        : {}),
      ...(input.asaasDescontoPercentual !== undefined
        ? { asaasDescontoPercentual: input.asaasDescontoPercentual }
        : {}),
      ...(input.nfseAtiva !== undefined ? { nfseAtiva: input.nfseAtiva } : {}),
      ...(input.nfseDiaLimite !== undefined ? { nfseDiaLimite: input.nfseDiaLimite } : {}),
      ...(input.nfseServicoCodigo !== undefined ? { nfseServicoCodigo: input.nfseServicoCodigo } : {}),
      ...(input.nfseServicoNome !== undefined ? { nfseServicoNome: input.nfseServicoNome } : {}),
      ...(input.nfseServicoDescricao !== undefined ? { nfseServicoDescricao: input.nfseServicoDescricao } : {}),
      ...(input.nfseMunicipalServiceId !== undefined
        ? { nfseMunicipalServiceId: input.nfseMunicipalServiceId || null }
        : {}),
      ...(input.nfseIssPercentual !== undefined ? { nfseIssPercentual: input.nfseIssPercentual } : {}),
      ...(input.redeCartaoMaxParcelas !== undefined
        ? { redeCartaoMaxParcelas: input.redeCartaoMaxParcelas }
        : {}),
      ...(input.emissaoAntecipadaDias !== undefined
        ? { emissaoAntecipadaDias: input.emissaoAntecipadaDias }
        : {}),
      ...(input.asaasDescontoDiasAntesVencimento !== undefined
        ? { asaasDescontoDiasAntesVencimento: input.asaasDescontoDiasAntesVencimento }
        : {}),
    };

    const configuracao = await configuracoesRepository.atualizar(dados);

    // Nunca loga segredos em texto puro na Auditoria, só quais campos mudaram.
    const CAMPOS_SENSIVEIS = [
      "legadoSenha",
      "asaasApiKey",
      "asaasWebhookToken",
      "redePv",
      "redeChaveIntegracao",
      "redeWebhookToken",
    ];
    await registrarAuditoria({
      usuarioId,
      entidade: ENTIDADE,
      entidadeId: atual.id,
      acao: "ATUALIZACAO",
      detalhes: {
        camposAlterados: Object.keys(input).filter((campo) => !CAMPOS_SENSIVEIS.includes(campo)),
      },
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
