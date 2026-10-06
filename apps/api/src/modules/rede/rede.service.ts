import { AppError, NotFoundError, ValidationError } from "../../shared/errors/app-error";
import { decifrar } from "../../shared/utils/criptografia";
import { configuracoesRepository } from "../configuracoes/configuracoes.repository";
import { financeiroRepository } from "../financeiro/financeiro.repository";
import { financeiroService } from "../financeiro/financeiro.service";
import { sincronizacaoLegadoRepository } from "../sincronizacao-legado/sincronizacao-legado.repository";
import { RedeClient } from "./rede-client";
import type { PagamentoCartaoInput, RedeWebhookPayload } from "./rede.schema";

// Único evento tratado nesta primeira versão — devolução (PV.REFUND_PIX)
// fica pra uma fase futura, igual à decisão já tomada pro Asaas.
const EVENTO_PIX_PAGO = "PV.UPDATE_TRANSACTION_PIX";

/** Referência única por tentativa (a Rede limita a 16 caracteres alfanuméricos). */
function gerarReferencia(): string {
  const aleatorio = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `P${Date.now().toString(36).toUpperCase()}${aleatorio}`.slice(0, 16);
}

export interface ResultadoPagamentoCartao {
  bandeira: string | null;
  final: string | null;
  parcelas: number;
  tid: string;
}

export const redeService = {
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
      reference: gerarReferencia(),
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

    // A cobrança JÁ foi feita no cartão: a partir daqui qualquer falha precisa ser
    // rastreável (TID) — nunca silenciosa, e nunca com dado de cartão.
    try {
      await financeiroRepository.update(parcela.id, {
        asaasPaymentId: resultado.tid,
        asaasBillingType: "CREDIT_CARD",
        provedorPagamento: "REDE",
        asaasStatus: "APPROVED",
        asaasDataGeracao: new Date(),
        cartaoBandeira: resultado.bandeira,
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
      bandeira: resultado.bandeira,
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
