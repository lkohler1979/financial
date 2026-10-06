import type { PagamentoProvedor } from "@prisma/client";
import { AppError, NotFoundError, ValidationError } from "../../shared/errors/app-error";
import { decifrar } from "../../shared/utils/criptografia";
import { registrarAuditoria } from "../auditoria/auditoria.service";
import { configuracoesRepository } from "../configuracoes/configuracoes.repository";
import { sacadosRepository } from "../sacados/sacados.repository";
import { alunosRepository } from "../alunos/alunos.repository";
import { financeiroRepository } from "../financeiro/financeiro.repository";
import { financeiroService } from "../financeiro/financeiro.service";
import { sincronizacaoLegadoRepository } from "../sincronizacao-legado/sincronizacao-legado.repository";
import { AsaasBillingType, AsaasClient } from "./asaas-client";
import type { AsaasWebhookPayload } from "./asaas.schema";
import { gerarReferenciaRede, RedeClient } from "../rede/rede-client";

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
  provedorPagamento: PagamentoProvedor | null;
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
    provedorPagamento: parcela.provedorPagamento,
    asaasBoletoUrl: parcela.asaasBoletoUrl,
    asaasLinhaDigitavel: parcela.asaasLinhaDigitavel,
    asaasInvoiceUrl: parcela.asaasInvoiceUrl,
    asaasPixQrCodeImagem: parcela.asaasPixQrCodeImagem,
    asaasPixCopiaECola: parcela.asaasPixCopiaECola,
    asaasPixQrCodeExpiracao: parcela.asaasPixQrCodeExpiracao,
  };
}

/** Qual provedor atende este tipo de cobrança, segundo a Configuração — null
 * quando o tipo está desabilitado. */
function obterProvedorParaTipo(
  configuracao: {
    provedorBoleto: PagamentoProvedor | null;
    provedorPix: PagamentoProvedor | null;
    provedorCartao: PagamentoProvedor | null;
  },
  billingType: AsaasBillingType,
): PagamentoProvedor | null {
  if (billingType === "BOLETO") return configuracao.provedorBoleto;
  if (billingType === "PIX") return configuracao.provedorPix;
  return configuracao.provedorCartao;
}

/** Formata uma data no formato exigido pela Rede: YYYY-MM-DDThh:mm:ss, em
 * horário LOCAL (America/Sao_Paulo — o processo roda com TZ fixo) e sem
 * milissegundos nem fuso. Em UTC o QR Code passava do limite de 15 dias e a
 * Rede recusava (erro 3077). */
function formatarDataHoraRede(data: Date): string {
  const dois = (n: number) => String(n).padStart(2, "0");
  return (
    `${data.getFullYear()}-${dois(data.getMonth() + 1)}-${dois(data.getDate())}` +
    `T${dois(data.getHours())}:${dois(data.getMinutes())}:${dois(data.getSeconds())}`
  );
}

/** Monta `fine`/`interest`/`discount` a partir da Configuração — cada um só
 * entra no payload se o respectivo percentual estiver preenchido (o Asaas
 * recomenda não enviar o campo com valor nulo, pra não sobrescrever a
 * configuração padrão da conta). `dueDateLimitDays` do desconto cai pra 0
 * (= vale só até o vencimento) quando não configurado. */
function montarJurosMultaDesconto(configuracao: {
  asaasMultaPercentual: unknown;
  asaasJurosMensalPercentual: unknown;
  asaasDescontoPercentual: unknown;
  asaasDescontoDiasAntesVencimento: number | null;
}) {
  return {
    ...(configuracao.asaasMultaPercentual != null
      ? { fine: { value: Number(configuracao.asaasMultaPercentual), type: "PERCENTAGE" as const } }
      : {}),
    ...(configuracao.asaasJurosMensalPercentual != null
      ? { interest: { value: Number(configuracao.asaasJurosMensalPercentual) } }
      : {}),
    ...(configuracao.asaasDescontoPercentual != null
      ? {
          discount: {
            value: Number(configuracao.asaasDescontoPercentual),
            type: "PERCENTAGE" as const,
            dueDateLimitDays: configuracao.asaasDescontoDiasAntesVencimento ?? 0,
          },
        }
      : {}),
  };
}

export async function obterClienteAsaas(): Promise<AsaasClient> {
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
      ...(aluno.cep ? { postalCode: aluno.cep.replace(/\D/g, "") } : {}),
      ...(aluno.endereco ? { address: aluno.endereco } : {}),
      ...(aluno.numero ? { addressNumber: aluno.numero } : {}),
      ...(aluno.complemento ? { complement: aluno.complemento } : {}),
      ...(aluno.bairro ? { province: aluno.bairro } : {}),
    });

    await alunosRepository.update(aluno.id, { asaasCustomerId: clienteAsaas.id });
    return clienteAsaas.id;
  },

  /** Cliente Asaas do sacado (pessoa/empresa que paga em lugar do aluno). */
  async obterOuCriarClienteSacado(sacadoId: string): Promise<string> {
    const sacado = await sacadosRepository.findById(sacadoId);
    if (!sacado) throw new NotFoundError("Sacado não encontrado");
    if (sacado.asaasCustomerId) return sacado.asaasCustomerId;

    const client = await obterClienteAsaas();
    const clienteAsaas = await client.criarCliente({
      name: sacado.nome,
      cpfCnpj: sacado.cpfCnpj,
      email: sacado.email ?? undefined,
      mobilePhone: sacado.telefone ?? undefined,
      externalReference: sacado.id,
      ...(sacado.cep ? { postalCode: sacado.cep.replace(/\D/g, "") } : {}),
      ...(sacado.endereco ? { address: sacado.endereco } : {}),
      ...(sacado.numero ? { addressNumber: sacado.numero } : {}),
      ...(sacado.complemento ? { complement: sacado.complemento } : {}),
      ...(sacado.bairro ? { province: sacado.bairro } : {}),
    });
    await sacadosRepository.update(sacado.id, { asaasCustomerId: clienteAsaas.id });
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
  async gerarCobrancaParcela(parcelaId: string, billingType: AsaasBillingType, usuarioId: string | null) {
    const parcela = await financeiroRepository.findById(parcelaId);
    if (!parcela) throw new NotFoundError("Parcela não encontrada");

    if (parcela.asaasPaymentId) {
      return selecionarCamposCobranca(parcela);
    }

    const configuracao = await configuracoesRepository.obterOuCriar();
    const provedor = obterProvedorParaTipo(configuracao, billingType);
    if (!provedor) {
      throw new ValidationError(
        "Esta forma de pagamento não está habilitada (tela de Configurações)",
      );
    }

    if (provedor === "REDE") {
      // Só Pix é suportado pela Rede nesta primeira versão — garantido pelo
      // Zod em configuracoes.schema.ts (provedorBoleto/provedorCartao só
      // aceitam ASAAS), mas confere de novo aqui por segurança.
      if (billingType === "CREDIT_CARD") {
        // Cartão pela Rede não tem link: o pagador digita o cartão no formulário
        // (área do aluno) e a baixa é imediata — ver redeService.pagarComCartao.
        throw new AppError(
          "Cartão pela Rede é pago no formulário de cartão (não gera link de cobrança)",
          422,
          "CARTAO_REDE_SEM_LINK",
        );
      }
      if (billingType !== "PIX") {
        throw new ValidationError("A Rede suporta apenas Pix e cartão de crédito");
      }
      return this.gerarCobrancaPixRede(parcela, usuarioId);
    }

    // A cobrança sai em nome do sacado quando a matrícula tem um; senão, do aluno.
    const customerId = parcela.matricula.sacado
      ? await this.obterOuCriarClienteSacado(parcela.matricula.sacado.id)
      : await this.obterOuCriarClienteAluno(parcela.matricula.aluno.id);
    const client = await obterClienteAsaas();

    const cobranca = await client.criarCobranca({
      customer: customerId,
      billingType,
      value: Number(parcela.valor),
      dueDate: parcela.vencimento.toISOString().slice(0, 10),
      description: `${parcela.matricula.curso.nome} — parcela ${parcela.parcela}`,
      externalReference: parcela.id,
      ...montarJurosMultaDesconto(configuracao),
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
      provedorPagamento: "ASAAS",
      asaasBoletoUrl: cobranca.bankSlipUrl,
      asaasLinhaDigitavel: linhaDigitavel,
      asaasInvoiceUrl: cobranca.invoiceUrl,
      asaasPixQrCodeImagem: pixQrCodeImagem,
      asaasPixCopiaECola: pixCopiaECola,
      asaasPixQrCodeExpiracao: pixQrCodeExpiracao,
      asaasStatus: cobranca.status,
      asaasDataGeracao: new Date(),
    });

    if (usuarioId) {
      await registrarAuditoria({
        usuarioId,
        entidade: ENTIDADE_PARCELA,
        entidadeId: parcelaId,
        acao: "ATUALIZACAO",
        detalhes: { acao: "cobranca_gerada", billingType, asaasPaymentId: cobranca.id },
      });
    }

    return selecionarCamposCobranca(atualizada);
  },

  /**
   * Gera um QR Code Pix via Rede (e.Rede) — não usa `customer`/tokenização
   * de cliente (a Rede não exige cadastro prévio pra gerar um Pix avulso).
   * A expiração do QR Code é o vencimento da parcela, limitada ao máximo de
   * 15 dias permitido pela Rede (e nunca no passado, mesmo que a parcela já
   * tenha vencido).
   */
  async gerarCobrancaPixRede(
    parcela: NonNullable<Awaited<ReturnType<typeof financeiroRepository.findById>>>,
    usuarioId: string | null,
  ) {
    const client = await obterClienteRede();

    const agora = new Date();
    const umDiaAFrente = new Date(agora.getTime() + 24 * 60 * 60 * 1000);
    // Limite da Rede: até 15 dias — 1 hora de margem para não estourar por arredondamento/fuso.
    const maximoFuturo = new Date(agora.getTime() + (15 * 24 - 1) * 60 * 60 * 1000);
    const alvo = parcela.vencimento > agora ? parcela.vencimento : umDiaAFrente;
    const expiracao = alvo > maximoFuturo ? maximoFuturo : alvo;

    const cobranca = await client.criarCobrancaPix({
      // A Rede limita a referência a 16 caracteres — o vínculo com a parcela é o TID, gravado abaixo.
      reference: gerarReferenciaRede(),
      amount: Math.round(Number(parcela.valor) * 100),
      dateTimeExpiration: formatarDataHoraRede(expiracao),
    });

    const atualizada = await financeiroRepository.update(parcela.id, {
      asaasPaymentId: cobranca.tid,
      asaasBillingType: "PIX",
      provedorPagamento: "REDE",
      asaasPixQrCodeImagem: cobranca.qrCodeImagem,
      asaasPixCopiaECola: cobranca.qrCodeCopiaECola,
      asaasPixQrCodeExpiracao: cobranca.dataExpiracao ? new Date(cobranca.dataExpiracao) : expiracao,
      asaasStatus: "PENDING",
      asaasDataGeracao: new Date(),
    });

    if (usuarioId) {
      await registrarAuditoria({
        usuarioId,
        entidade: ENTIDADE_PARCELA,
        entidadeId: parcela.id,
        acao: "ATUALIZACAO",
        detalhes: { acao: "cobranca_gerada", billingType: "PIX", provedor: "REDE", tid: cobranca.tid },
      });
    }

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
