import { AppError } from "../../shared/errors/app-error";

// Cliente HTTP para a API e.Rede (Itaú) — fetch nativo, mesmo padrão já usado
// em asaas-client.ts e sincronizacao-legado/legado-client.ts (sem axios no
// projeto). Docs: https://developer.userede.com.br/e-rede
//
// Só Pix implementado — a Rede não tem Boleto, e Cartão exigiria coletar
// número/CVV do cliente (fluxo de adquirente tradicional, diferente da
// página hospedada do Asaas); decisão do usuário, 2026-10-01: não
// implementar Cartão via Rede por enquanto, pra não reabrir escopo PCI-DSS.

const BASE_URLS: Record<"SANDBOX" | "PRODUCAO", { oauth: string; transacoes: string }> = {
  SANDBOX: {
    oauth: "https://rl7-sandbox-api.useredecloud.com.br/oauth2/token",
    transacoes: "https://sandbox-erede.useredecloud.com.br/v2/transactions",
  },
  PRODUCAO: {
    oauth: "https://api.userede.com.br/redelabs/oauth2/token",
    transacoes: "https://api.userede.com.br/erede/v2/transactions",
  },
};

/** Referência única por transação (a Rede limita a 16 caracteres alfanuméricos). */
export function gerarReferenciaRede(): string {
  const aleatorio = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `P${Date.now().toString(36).toUpperCase()}${aleatorio}`.slice(0, 16);
}

export interface RedeClienteConfig {
  /** PV (número de filiação) — usado como `clientId` no OAuth2. */
  pv: string;
  /** Chave de integração gerada no Portal Use Rede — `clientSecret` do OAuth2. */
  chaveIntegracao: string;
  ambiente: "SANDBOX" | "PRODUCAO";
}

export interface RedeCriarCobrancaPixInput {
  /** Identificador único gerado pelo Ethos (até 50 chars) — usamos o id da Parcela. */
  reference: string;
  /** Em centavos, sem separador de milhar/decimal (ex.: R$10,00 = 1000). */
  amount: number;
  /** Formato YYYY-MM-DDThh:mm:ss — prazo máximo de 15 dias no futuro. */
  dateTimeExpiration: string;
}

export interface RedeCobrancaPix {
  /** Identificador único da transação na Rede — equivalente ao `id` do Asaas. */
  tid: string;
  qrCodeImagem: string | null;
  qrCodeCopiaECola: string | null;
  dataExpiracao: string | null;
}

export interface RedeCriarCobrancaCartaoInput {
  /** Até 16 caracteres alfanuméricos, único por tentativa. */
  reference: string;
  /** Em centavos. */
  amount: number;
  /** 1 = à vista; de 2 a 12 = parcelado. */
  installments: number;
  cardholderName: string;
  cardNumber: string;
  expirationMonth: number;
  /** 4 dígitos. */
  expirationYear: number;
  securityCode: string;
}

/** Resultado de uma tentativa de cartão — nunca contém número nem CVV. */
export interface RedeResultadoCartao {
  aprovado: boolean;
  returnCode: string;
  returnMessage: string;
  tid: string | null;
  nsu: string | null;
  authorizationCode: string | null;
  bandeira: string | null;
  bin: string | null;
  final: string | null;
}

/** Resultado de um pedido de estorno: concluído na hora (359) ou aceito e em processamento (360, D+1). */
export interface RedeResultadoEstorno {
  concluido: boolean;
  returnCode: string;
  returnMessage: string;
  refundId: string | null;
}

export type StatusEstornoRede = "Done" | "Denied" | "Processing";

interface RedeTokenResposta {
  access_token: string;
  expires_in: number;
}

// Cache de token em memória por PV+ambiente (não em banco — o token dura só
// 24 minutos, não vale a pena persistir). Evita gerar um token OAuth novo a
// cada cobrança gerada.
const tokensCache = new Map<string, { accessToken: string; expiraEm: number }>();

export class RedeClient {
  constructor(private readonly config: RedeClienteConfig) {}

  private async obterTokenAcesso(): Promise<string> {
    const chaveCache = `${this.config.ambiente}:${this.config.pv}`;
    const cache = tokensCache.get(chaveCache);
    if (cache && cache.expiraEm > Date.now()) return cache.accessToken;

    const credenciais = Buffer.from(`${this.config.pv}:${this.config.chaveIntegracao}`).toString(
      "base64",
    );
    const resposta = await fetch(BASE_URLS[this.config.ambiente].oauth, {
      method: "POST",
      headers: {
        authorization: `Basic ${credenciais}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!resposta.ok) {
      throw new AppError(
        "Falha ao autenticar com a Rede (PV ou chave de integração inválidos?)",
        502,
        "REDE_AUTH_ERRO",
      );
    }

    const corpo = (await resposta.json()) as RedeTokenResposta;
    // Margem de 1 min antes da expiração real (24 min), pra nunca usar um
    // token vencido por causa da latência da própria chamada.
    const expiraEm = Date.now() + (corpo.expires_in - 60) * 1000;
    tokensCache.set(chaveCache, { accessToken: corpo.access_token, expiraEm });
    return corpo.access_token;
  }

  private async enviar(caminho: string, init: RequestInit = {}) {
    const token = await this.obterTokenAcesso();
    const resposta = await fetch(`${BASE_URLS[this.config.ambiente].transacoes}${caminho}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        ...init.headers,
      },
    });
    const corpo = await resposta.json().catch(() => null);
    return { resposta, corpo };
  }

  private async requisitar<T>(caminho: string, init: RequestInit = {}): Promise<T> {
    const { resposta, corpo } = await this.enviar(caminho, init);

    if (!resposta.ok) {
      const mensagem =
        (corpo as { returnMessage?: string } | null)?.returnMessage ??
        `Rede respondeu ${resposta.status} para ${caminho}`;
      throw new AppError(mensagem, 502, "REDE_ERRO", corpo);
    }

    return corpo as T;
  }

  /** Gera um QR Code Pix — `POST /v2/transactions` com `kind: "Pix"`. */
  async criarCobrancaPix(dados: RedeCriarCobrancaPixInput): Promise<RedeCobrancaPix> {
    const corpo = await this.requisitar<{
      tid: string;
      qrCodeResponse?: { qrCodeImage?: string; qrCodeData?: string; dateTimeExpiration?: string };
    }>("", {
      method: "POST",
      body: JSON.stringify({
        kind: "Pix",
        reference: dados.reference,
        amount: dados.amount,
        qrCode: { dateTimeExpiration: dados.dateTimeExpiration },
      }),
    });

    return {
      tid: corpo.tid,
      qrCodeImagem: corpo.qrCodeResponse?.qrCodeImage ?? null,
      qrCodeCopiaECola: corpo.qrCodeResponse?.qrCodeData ?? null,
      dataExpiracao: corpo.qrCodeResponse?.dateTimeExpiration ?? null,
    };
  }

  /**
   * Autoriza e captura (automática) um cartão de crédito — `POST /v2/transactions`
   * com `kind: "credit"`. Recusa do emissor NÃO lança erro: volta `aprovado: false`
   * com o código/mensagem da Rede (a Rede devolve `returnCode` "00" só quando aprova).
   * Falha de comunicação/autenticação lança AppError. O corpo enviado (com o
   * número do cartão) nunca é logado nem devolvido em erros.
   */
  async criarCobrancaCartao(dados: RedeCriarCobrancaCartaoInput): Promise<RedeResultadoCartao> {
    const { resposta, corpo } = await this.enviar("", {
      method: "POST",
      body: JSON.stringify({
        capture: true,
        kind: "credit",
        reference: dados.reference,
        amount: dados.amount,
        ...(dados.installments >= 2 ? { installments: dados.installments } : {}),
        cardholderName: dados.cardholderName,
        cardNumber: dados.cardNumber,
        expirationMonth: dados.expirationMonth,
        expirationYear: dados.expirationYear,
        securityCode: dados.securityCode,
      }),
    });

    const c = corpo as {
      returnCode?: string;
      returnMessage?: string;
      tid?: string;
      nsu?: string;
      authorizationCode?: string;
      cardBin?: string;
      last4?: string;
      brand?: { name?: string; authorizationCode?: string };
    } | null;

    // Sem returnCode = a Rede nem chegou a avaliar (erro de infraestrutura).
    if (!c?.returnCode) {
      throw new AppError(
        `Rede respondeu ${resposta.status} ao processar o cartão`,
        502,
        "REDE_ERRO",
      );
    }

    return {
      aprovado: resposta.ok && c.returnCode === "00",
      returnCode: c.returnCode,
      returnMessage: c.returnMessage ?? "",
      tid: c.tid ?? null,
      nsu: c.nsu ?? null,
      authorizationCode: c.authorizationCode ?? c.brand?.authorizationCode ?? null,
      bandeira: c.brand?.name?.replace(/\.$/, "") ?? null,
      bin: c.cardBin ?? null,
      final: c.last4 ?? null,
    };
  }

  /**
   * Estorna (cancela) uma transação de cartão — `POST /v2/transactions/{tid}/refunds`.
   * 359 = estorno concluído; 360 = pedido aceito, resultado final só no dia seguinte
   * (conferir com `consultarEstornos`). Qualquer outro código lança AppError com a
   * mensagem da Rede (ex.: 354 prazo expirado, 355 já cancelada).
   */
  async estornarCartao(tid: string, amountCentavos: number): Promise<RedeResultadoEstorno> {
    const { resposta, corpo } = await this.enviar(`/${encodeURIComponent(tid)}/refunds`, {
      method: "POST",
      body: JSON.stringify({ amount: amountCentavos }),
    });
    const c = corpo as { returnCode?: string; returnMessage?: string; refundId?: string } | null;

    if (!c?.returnCode) {
      throw new AppError(`Rede respondeu ${resposta.status} ao pedir o estorno`, 502, "REDE_ERRO");
    }
    if (c.returnCode !== "359" && c.returnCode !== "360") {
      throw new AppError(
        `Estorno não realizado: ${c.returnMessage ?? c.returnCode}`,
        422,
        "REDE_ESTORNO_RECUSADO",
        { returnCode: c.returnCode },
      );
    }
    return {
      concluido: c.returnCode === "359",
      returnCode: c.returnCode,
      returnMessage: c.returnMessage ?? "",
      refundId: c.refundId ?? null,
    };
  }

  /** Lista os estornos de uma transação (`GET /v2/transactions/{tid}/refunds`) com o status de cada um. */
  async consultarEstornos(
    tid: string,
  ): Promise<{ refundId: string | null; status: StatusEstornoRede; amount: number }[]> {
    const corpo = await this.requisitar<{
      refunds?: { refundId?: string; status?: StatusEstornoRede; amount?: number }[];
    }>(`/${encodeURIComponent(tid)}/refunds`, { method: "GET" });
    return (corpo.refunds ?? []).map((r) => ({
      refundId: r.refundId ?? null,
      status: r.status ?? "Processing",
      amount: r.amount ?? 0,
    }));
  }

  /**
   * Registra a URL de notificação de webhook — só funciona em sandbox
   * (self-service via API); em produção, a Rede exige contato com o suporte
   * deles informando a mesma URL/token (ver tela de Configurações).
   */
  async registrarUrlNotificacao(url: string, tokenAutorizacao?: string): Promise<void> {
    await this.requisitar("/notification-url", {
      method: "POST",
      body: JSON.stringify({
        url,
        ...(tokenAutorizacao
          ? { authorization: { type: "Bearer", token: `Bearer ${tokenAutorizacao}` } }
          : {}),
      }),
    });
  }
}
