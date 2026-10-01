import { AppError, NotFoundError, ValidationError } from "../../shared/errors/app-error";
import { decifrar } from "../../shared/utils/criptografia";
import { registrarAuditoria } from "../auditoria/auditoria.service";
import { configuracoesRepository } from "../configuracoes/configuracoes.repository";
import { alunosRepository } from "../alunos/alunos.repository";
import { financeiroRepository } from "../financeiro/financeiro.repository";
import { financeiroService } from "../financeiro/financeiro.service";
import { sincronizacaoLegadoRepository } from "../sincronizacao-legado/sincronizacao-legado.repository";
import { AsaasBillingType, AsaasClient } from "./asaas-client";
import type { AsaasWebhookPayload } from "./asaas.schema";

const ENTIDADE_PARCELA = "Parcela";

// Eventos tratados nesta primeira versão (pedido do usuário, 2026-10-01) —
// qualquer outro evento válido do Asaas é aceito (200 OK, pra não disparar
// retry) e simplesmente ignorado. Estorno/chargeback/exclusão ficam pra uma
// fase futura.
const EVENTOS_PAGAMENTO_CONFIRMADO = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);

/** Recorta só os campos públicos da cobrança (ignora id interno da Parcela,
 * timestamps etc.) — usado tanto na resposta de uma cobrança recém-criada
 * quanto na idempotência (cobrança já existente). */
function selecionarCamposCobranca(parcela: {
  asaasPaymentId: string | null;
  asaasBillingType: string | null;
  asaasBoletoUrl: string | null;
  asaasLinhaDigitavel: string | null;
  asaasInvoiceUrl: string | null;
  asaasPixQrCodeImagem: string | null;
  asaasPixCopiaECola: string | null;
  asaasPixQrCodeExpiracao: Date | null;
}) {
  return {
    asaasPaymentId: parcela.asaasPaymentId,
    asaasBillingType: parcela.asaasBillingType,
    asaasBoletoUrl: parcela.asaasBoletoUrl,
    asaasLinhaDigitavel: parcela.asaasLinhaDigitavel,
    asaasInvoiceUrl: parcela.asaasInvoiceUrl,
    asaasPixQrCodeImagem: parcela.asaasPixQrCodeImagem,
    asaasPixCopiaECola: parcela.asaasPixCopiaECola,
    asaasPixQrCodeExpiracao: parcela.asaasPixQrCodeExpiracao,
  };
}

async function obterClienteAsaas(): Promise<AsaasClient> {
  const configuracao = await configuracoesRepository.obterOuCriar();
  if (!configuracao.asaasApiKeyCriptografada) {
    throw new ValidationError(
      "Integração com o Asaas não está configurada (tela de Configurações)",
    );
  }
  return new AsaasClient({
    apiKey: decifrar(configuracao.asaasApiKeyCriptografada),
    ambiente: configuracao.asaasAmbiente,
  });
}

export const asaasService = {
  /** Cliente Asaas do aluno — reaproveita o `asaasCustomerId` já cacheado, ou
   * cria um novo (POST /customers) na primeira cobrança. */
  async obterOuCriarClienteAluno(alunoId: string): Promise<string> {
    const aluno = await alunosRepository.findById(alunoId);
    if (!aluno) throw new NotFoundError("Aluno não encontrado");
    if (aluno.asaasCustomerId) return aluno.asaasCustomerId;

    const client = await obterClienteAsaas();
    const clienteAsaas = await client.criarCliente({
      name: aluno.nome,
      cpfCnpj: aluno.cpf,
      email: aluno.email ?? undefined,
      mobilePhone: aluno.telefone1 ?? undefined,
      externalReference: aluno.id,
    });

    await alunosRepository.update(aluno.id, { asaasCustomerId: clienteAsaas.id });
    return clienteAsaas.id;
  },

  /**
   * Gera a cobrança de uma Parcela via Asaas — Boleto, Pix ou Cartão.
   * Idempotente: se a parcela já tem `asaasPaymentId`, devolve a cobrança já
   * existente em vez de criar uma nova (não suporta trocar o tipo de uma
   * cobrança já gerada nesta primeira versão).
   *
   * Cartão (`CREDIT_CARD`) nunca recebe dados de cartão aqui — o Ethos não
   * coleta número/CVV (evita assumir escopo de PCI-DSS); o cliente paga pela
   * `asaasInvoiceUrl`, a página segura hospedada pelo próprio Asaas.
   */
  async gerarCobrancaParcela(parcelaId: string, billingType: AsaasBillingType, usuarioId: string) {
    const parcela = await financeiroRepository.findById(parcelaId);
    if (!parcela) throw new NotFoundError("Parcela não encontrada");

    if (parcela.asaasPaymentId) {
      return selecionarCamposCobranca(parcela);
    }

    const configuracao = await configuracoesRepository.obterOuCriar();
    if (!configuracao.asaasMetodosAceitos.includes(billingType)) {
      throw new ValidationError(
        "Esta forma de pagamento não está habilitada (tela de Configurações)",
      );
    }

    const customerId = await this.obterOuCriarClienteAluno(parcela.matricula.aluno.id);
    const client = await obterClienteAsaas();

    const cobranca = await client.criarCobranca({
      customer: customerId,
      billingType,
      value: Number(parcela.valor),
      dueDate: parcela.vencimento.toISOString().slice(0, 10),
      description: `${parcela.matricula.curso.nome} — parcela ${parcela.parcela}`,
      externalReference: parcela.id,
    });

    // O resto é melhor esforço: a cobrança já foi criada no Asaas — uma
    // falha ao buscar linha digitável/QR Code não desfaz isso, só deixa o
    // dado extra faltando (pode ser consultado de novo depois).
    let linhaDigitavel: string | null = null;
    let pixQrCodeImagem: string | null = null;
    let pixCopiaECola: string | null = null;
    let pixQrCodeExpiracao: Date | null = null;

    try {
      if (billingType === "BOLETO") {
        const dados = await client.obterLinhaDigitavel(cobranca.id);
        linhaDigitavel = dados.identificationField;
      } else if (billingType === "PIX") {
        const dados = await client.obterQrCodePix(cobranca.id);
        pixQrCodeImagem = dados.encodedImage;
        pixCopiaECola = dados.payload;
        pixQrCodeExpiracao = dados.expirationDate ? new Date(dados.expirationDate) : null;
      }
    } catch {
      // Sem dado extra desta vez — a cobrança em si já existe e será
      // devolvida normalmente (ver selecionarCamposCobranca).
    }

    const atualizada = await financeiroRepository.update(parcelaId, {
      asaasPaymentId: cobranca.id,
      asaasBillingType: billingType,
      asaasBoletoUrl: cobranca.bankSlipUrl,
      asaasLinhaDigitavel: linhaDigitavel,
      asaasInvoiceUrl: cobranca.invoiceUrl,
      asaasPixQrCodeImagem: pixQrCodeImagem,
      asaasPixCopiaECola: pixCopiaECola,
      asaasPixQrCodeExpiracao: pixQrCodeExpiracao,
      asaasStatus: cobranca.status,
      asaasDataGeracao: new Date(),
    });

    await registrarAuditoria({
      usuarioId,
      entidade: ENTIDADE_PARCELA,
      entidadeId: parcelaId,
      acao: "ATUALIZACAO",
      detalhes: { acao: "cobranca_gerada", billingType, asaasPaymentId: cobranca.id },
    });

    return selecionarCamposCobranca(atualizada);
  },

  /**
   * Processa um evento de webhook do Asaas. Valida o token configurado em
   * Configurações (header `asaas-access-token`) antes de aceitar qualquer
   * payload. `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` marcam a Parcela
   * correspondente como PAGO; qualquer outro evento é aceito e ignorado.
   */
  async processarWebhook(payload: AsaasWebhookPayload, tokenRecebido: string | undefined) {
    const configuracao = await configuracoesRepository.obterOuCriar();
    if (!configuracao.asaasWebhookTokenCriptografado) {
      throw new AppError(
        "Webhook do Asaas não configurado (tela de Configurações)",
        401,
        "ASAAS_WEBHOOK_NAO_CONFIGURADO",
      );
    }

    const tokenEsperado = decifrar(configuracao.asaasWebhookTokenCriptografado);
    if (!tokenRecebido || tokenRecebido !== tokenEsperado) {
      throw new AppError("Token do webhook inválido", 401, "ASAAS_WEBHOOK_TOKEN_INVALIDO");
    }

    if (!EVENTOS_PAGAMENTO_CONFIRMADO.has(payload.event) || !payload.payment) {
      return;
    }

    const parcela = await financeiroRepository.findByAsaasPaymentId(payload.payment.id);
    if (!parcela) return; // Cobrança não originada por esta Parcela — ignora.

    // Webhook não carrega um usuário autenticado — mesma convenção já usada
    // pela sincronização agendada com o sistema legado (sem "ator" humano).
    const usuarioSistema = await sincronizacaoLegadoRepository.obterUsuarioSistema();
    if (!usuarioSistema) return; // Sem nenhum ADMINISTRADOR cadastrado ainda — nada a registrar.

    await financeiroService.atualizar(
      parcela.id,
      {
        status: "PAGO",
        dataPagamento: payload.payment.paymentDate ? new Date(payload.payment.paymentDate) : new Date(),
        valorPago: payload.payment.value ?? Number(parcela.valor),
      },
      usuarioSistema,
    );
  },
};
