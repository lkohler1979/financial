import { AppError } from "../../shared/errors/app-error";
import { decifrar } from "../../shared/utils/criptografia";
import { configuracoesRepository } from "../configuracoes/configuracoes.repository";
import { financeiroRepository } from "../financeiro/financeiro.repository";
import { financeiroService } from "../financeiro/financeiro.service";
import { sincronizacaoLegadoRepository } from "../sincronizacao-legado/sincronizacao-legado.repository";
import type { RedeWebhookPayload } from "./rede.schema";

// Único evento tratado nesta primeira versão — devolução (PV.REFUND_PIX)
// fica pra uma fase futura, igual à decisão já tomada pro Asaas.
const EVENTO_PIX_PAGO = "PV.UPDATE_TRANSACTION_PIX";

export const redeService = {
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
