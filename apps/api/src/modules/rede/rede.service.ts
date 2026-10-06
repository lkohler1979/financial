import { registrarAuditoria } from "../auditoria/auditoria.service";
import { AppError, NotFoundError, ValidationError } from "../../shared/errors/app-error";
import { decifrar } from "../../shared/utils/criptografia";
import { configuracoesRepository } from "../configuracoes/configuracoes.repository";
import { financeiroRepository } from "../financeiro/financeiro.repository";
import { financeiroService } from "../financeiro/financeiro.service";
import { sincronizacaoLegadoRepository } from "../sincronizacao-legado/sincronizacao-legado.repository";
import { detectarBandeira } from "../../shared/utils/cartao";
import { gerarReferenciaRede, RedeClient } from "./rede-client";
import type { PagamentoCartaoInput, RedeWebhookPayload } from "./rede.schema";

// Único evento tratado nesta primeira versão — devolução (PV.REFUND_PIX)
// fica pra uma fase futura, igual à decisão já tomada pro Asaas.
const EVENTO_PIX_PAGO = "PV.UPDATE_TRANSACTION_PIX";

export interface ResultadoPagamentoCartao {
  bandeira: string | null;
  final: string | null;
  parcelas: number;
  tid: string;
}

/** Cliente da Rede com as credenciais salvas em Configurações (ou erro claro se faltarem). */
async function obterClienteRede(): Promise<RedeClient> {
  const configuracao = await configuracoesRepository.obterOuCriar();
  if (!configuracao.redePvCriptografado || !configuracao.redeChaveIntegracaoCriptografada) {
    throw new ValidationError("Integração com a Rede não está configurada (tela de Configurações)");
  }
  return new RedeClient({
    pv: decifrar(configuracao.redePvCriptografado),
    chaveIntegracao: decifrar(configuracao.redeChaveIntegracaoCriptografada),
    ambiente: configuracao.redeAmbiente,
  });
}

/** Parcela paga no cartão pela Rede — a única que pode ser estornada por aqui. */
function exigirPagaNoCartaoRede(parcela: {
  status: string;
  provedorPagamento: string | null;
  asaasBillingType: string | null;
  asaasPaymentId: string | null;
}) {
  if (
    parcela.status !== "PAGO" ||
    parcela.provedorPagamento !== "REDE" ||
    parcela.asaasBillingType !== "CREDIT_CARD" ||
    !parcela.asaasPaymentId
  ) {
    throw new ValidationError("Só é possível estornar parcelas pagas no cartão pela Rede");
  }
}

export interface ResultadoEstorno {
  /** true = o dinheiro já foi devolvido e a parcela reabriu; false = Rede ainda processando (D+1). */
  concluido: boolean;
}

export const redeService = {
  /**
   * Estorno TOTAL de um pagamento de cartão feito pela Rede.
   * - 359 (mesmo dia): estorno concluído na hora → a parcela volta a "em aberto".
   * - 360 (dia seguinte, D+1): pedido aceito; a parcela continua paga e fica marcada
   *   "estorno em processamento" até `conferirEstorno` confirmar com a Rede.
   * Só ADMINISTRADOR (ver rota). Fica na Auditoria com o motivo.
   */
  async estornarCartao(parcelaId: string, motivo: string, usuarioId: string): Promise<ResultadoEstorno> {
    const parcela = await financeiroRepository.findById(parcelaId);
    if (!parcela) throw new NotFoundError("Parcela não encontrada");
    exigirPagaNoCartaoRede(parcela);
    if (parcela.cartaoEstornoId) {
      throw new ValidationError("Já existe um estorno em processamento para esta parcela");
    }

    const client = await obterClienteRede();
    const valorPago = Number(parcela.valorPago ?? parcela.valor);
    const resultado = await client.estornarCartao(
      parcela.asaasPaymentId as string,
      Math.round(valorPago * 100),
    );

    await registrarAuditoria({
      usuarioId,
      entidade: "Parcela",
      entidadeId: parcela.id,
      acao: "ATUALIZACAO",
      detalhes: {
        acao: "estorno_cartao_solicitado",
        tid: parcela.asaasPaymentId,
        refundId: resultado.refundId,
        concluido: resultado.concluido,
        motivo,
      },
    });

    if (resultado.concluido) {
      await this.reabrirParcelaEstornada(parcela.id, usuarioId);
      return { concluido: true };
    }
    await financeiroRepository.update(parcela.id, {
      cartaoEstornoId: resultado.refundId,
      cartaoEstornoEm: new Date(),
    });
    return { concluido: false };
  },

  /**
   * Confere na Rede um estorno em processamento: concluído → parcela reabre;
   * negado → some a marcação de "em processamento" (a parcela segue paga).
   */
  async conferirEstorno(parcelaId: string, usuarioId: string | null): Promise<"CONCLUIDO" | "NEGADO" | "PROCESSANDO"> {
    const parcela = await financeiroRepository.findById(parcelaId);
    if (!parcela) throw new NotFoundError("Parcela não encontrada");
    if (!parcela.cartaoEstornoId || !parcela.asaasPaymentId) {
      throw new ValidationError("Esta parcela não tem estorno em processamento");
    }

    const client = await obterClienteRede();
    const estornos = await client.consultarEstornos(parcela.asaasPaymentId);
    const estorno = estornos.find((e) => e.refundId === parcela.cartaoEstornoId);
    if (!estorno || estorno.status === "Processing") return "PROCESSANDO";

    if (estorno.status === "Done") {
      await this.reabrirParcelaEstornada(parcela.id, usuarioId);
      return "CONCLUIDO";
    }
    await financeiroRepository.update(parcela.id, { cartaoEstornoId: null, cartaoEstornoEm: null });
    if (usuarioId) {
      await registrarAuditoria({
        usuarioId,
        entidade: "Parcela",
        entidadeId: parcela.id,
        acao: "ATUALIZACAO",
        detalhes: { acao: "estorno_cartao_negado", tid: parcela.asaasPaymentId, refundId: parcela.cartaoEstornoId },
      });
    }
    return "NEGADO";
  },

  /** Job diário: confere todos os estornos que a Rede ainda estava processando. */
  async conferirEstornosPendentes(): Promise<{ conferidos: number; concluidos: number; negados: number }> {
    const pendentes = await financeiroRepository.listarComEstornoPendente();
    const usuarioSistema = await sincronizacaoLegadoRepository.obterUsuarioSistema();
    const resumo = { conferidos: 0, concluidos: 0, negados: 0 };
    for (const parcela of pendentes) {
      try {
        const r = await this.conferirEstorno(parcela.id, usuarioSistema ?? null);
        resumo.conferidos += 1;
        if (r === "CONCLUIDO") resumo.concluidos += 1;
        if (r === "NEGADO") resumo.negados += 1;
      } catch (erro) {
        console.error(`[rede] falha ao conferir estorno da parcela ${parcela.id}`, erro instanceof Error ? erro.message : erro);
      }
    }
    return resumo;
  },

  /** Dinheiro devolvido: a dívida reabre (em aberto, sem baixa nem vínculo com a transação). */
  async reabrirParcelaEstornada(parcelaId: string, usuarioId: string | null) {
    await financeiroRepository.update(parcelaId, {
      status: "EM_ABERTO",
      dataPagamento: null,
      valorPago: null,
      asaasPaymentId: null,
      asaasBillingType: null,
      provedorPagamento: null,
      asaasStatus: "REFUNDED",
      cartaoBandeira: null,
      cartaoFinal: null,
      cartaoParcelas: null,
      cartaoEstornoId: null,
      cartaoEstornoEm: null,
    });
    if (usuarioId) {
      await registrarAuditoria({
        usuarioId,
        entidade: "Parcela",
        entidadeId: parcelaId,
        acao: "ATUALIZACAO",
        detalhes: { acao: "estorno_cartao_concluido" },
      });
    }
  },

  /**
   * Cobra o cartão de crédito de uma parcela direto na Rede (captura automática)
   * e dá baixa na parcela quando aprovado. O número e o CVV só passam por aqui a
   * caminho da Rede — nunca são gravados, logados nem devolvidos; da transação
   * ficam só TID, bandeira e os 4 últimos dígitos.
   *
   * Quem chama (portal do aluno) já garantiu que a parcela é de quem está
   * pagando e aplicou o limite de tentativas.
   */
  async pagarComCartao(parcelaId: string, cartao: PagamentoCartaoInput): Promise<ResultadoPagamentoCartao> {
    const parcela = await financeiroRepository.findById(parcelaId);
    if (!parcela) throw new NotFoundError("Parcela não encontrada");
    if (parcela.status !== "EM_ABERTO") {
      throw new ValidationError("Só é possível pagar parcelas em aberto");
    }
    // Boleto/Pix já emitido ainda pode ser pago: pagar também no cartão geraria pagamento duplicado.
    if (parcela.asaasPaymentId) {
      throw new ValidationError(
        "Esta parcela já tem uma cobrança emitida (boleto/Pix). Pague por ela ou peça o cancelamento à secretaria.",
      );
    }

    const configuracao = await configuracoesRepository.obterOuCriar();
    if (configuracao.provedorCartao !== "REDE") {
      throw new ValidationError("O pagamento por cartão da Rede não está habilitado");
    }
    if (!configuracao.redePvCriptografado || !configuracao.redeChaveIntegracaoCriptografada) {
      throw new ValidationError("Integração com a Rede não está configurada (tela de Configurações)");
    }
    if (cartao.parcelas > configuracao.redeCartaoMaxParcelas) {
      throw new ValidationError(
        configuracao.redeCartaoMaxParcelas === 1
          ? "Pagamento no cartão disponível somente à vista"
          : `Parcelamento no cartão em até ${configuracao.redeCartaoMaxParcelas}x`,
      );
    }

    const client = new RedeClient({
      pv: decifrar(configuracao.redePvCriptografado),
      chaveIntegracao: decifrar(configuracao.redeChaveIntegracaoCriptografada),
      ambiente: configuracao.redeAmbiente,
    });

    const resultado = await client.criarCobrancaCartao({
      reference: gerarReferenciaRede(),
      amount: Math.round(Number(parcela.valor) * 100),
      installments: cartao.parcelas,
      cardholderName: cartao.nome,
      cardNumber: cartao.numero,
      expirationMonth: cartao.mes,
      expirationYear: cartao.ano,
      securityCode: cartao.cvv,
    });

    if (!resultado.aprovado || !resultado.tid) {
      throw new AppError(
        `Pagamento não autorizado${resultado.returnMessage ? `: ${resultado.returnMessage}` : ""}`,
        422,
        "CARTAO_RECUSADO",
        { returnCode: resultado.returnCode },
      );
    }

    const bandeira = resultado.bandeira ?? detectarBandeira(cartao.numero);

    // A cobrança JÁ foi feita no cartão: a partir daqui qualquer falha precisa ser
    // rastreável (TID) — nunca silenciosa, e nunca com dado de cartão.
    try {
      await financeiroRepository.update(parcela.id, {
        asaasPaymentId: resultado.tid,
        asaasBillingType: "CREDIT_CARD",
        provedorPagamento: "REDE",
        asaasStatus: "APPROVED",
        asaasDataGeracao: new Date(),
        cartaoBandeira: bandeira,
        cartaoFinal: resultado.final,
        cartaoParcelas: cartao.parcelas,
      });

      const usuarioSistema = await sincronizacaoLegadoRepository.obterUsuarioSistema();
      if (usuarioSistema) {
        await financeiroService.atualizar(
          parcela.id,
          { status: "PAGO", dataPagamento: new Date(), valorPago: Number(parcela.valor) },
          usuarioSistema,
        );
      } else {
        await financeiroRepository.update(parcela.id, {
          status: "PAGO",
          dataPagamento: new Date(),
          valorPago: parcela.valor,
        });
      }
    } catch (erro) {
      console.error(
        `[rede] cartão aprovado (TID ${resultado.tid}) mas falhou ao baixar a parcela ${parcela.id}`,
        erro instanceof Error ? erro.message : "erro desconhecido",
      );
      throw new AppError(
        `Pagamento aprovado, mas houve um erro ao registrá-lo. Não pague novamente — avise a secretaria informando o código ${resultado.tid}.`,
        500,
        "CARTAO_APROVADO_SEM_BAIXA",
      );
    }

    return {
      bandeira,
      final: resultado.final,
      parcelas: cartao.parcelas,
      tid: resultado.tid,
    };
  },

  /**
   * Processa uma notificação de webhook da Rede (confirmação de pagamento
   * Pix). Valida o token configurado (header `authorization`, formato
   * documentado pela Rede como "Bearer XXX") antes de aceitar qualquer
   * payload. Sempre aceito (200), mesmo evento não reconhecido/ignorado —
   * evita reentrega indevida.
   */
  async processarWebhook(payload: RedeWebhookPayload, tokenRecebido: string | undefined) {
    const configuracao = await configuracoesRepository.obterOuCriar();
    if (!configuracao.redeWebhookTokenCriptografado) {
      throw new AppError(
        "Webhook da Rede não configurado (tela de Configurações)",
        401,
        "REDE_WEBHOOK_NAO_CONFIGURADO",
      );
    }

    const tokenEsperado = `Bearer ${decifrar(configuracao.redeWebhookTokenCriptografado)}`;
    if (!tokenRecebido || tokenRecebido !== tokenEsperado) {
      throw new AppError("Token do webhook inválido", 401, "REDE_WEBHOOK_TOKEN_INVALIDO");
    }

    if (!payload.events?.includes(EVENTO_PIX_PAGO) || !payload.data?.id) {
      return; // Evento não reconhecido/ignorado — aceito (200), não processado.
    }

    // `payload.data.id` é o TID da transação Rede — guardado em
    // asaasPaymentId no momento da geração do QR Code (ver asaas.service.ts).
    const parcela = await financeiroRepository.findByAsaasPaymentId(payload.data.id);
    if (!parcela) return; // Cobrança não originada por esta Parcela — ignora.

    // Webhook não carrega um usuário autenticado — mesma convenção já usada
    // pelo webhook do Asaas e pela sincronização agendada com o legado.
    const usuarioSistema = await sincronizacaoLegadoRepository.obterUsuarioSistema();
    if (!usuarioSistema) return;

    await financeiroService.atualizar(
      parcela.id,
      { status: "PAGO", dataPagamento: new Date(), valorPago: Number(parcela.valor) },
      usuarioSistema,
    );
  },
};
