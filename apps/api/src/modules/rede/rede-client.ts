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

  private async requisitar<T>(caminho: string, init: RequestInit = {}): Promise<T> {
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
