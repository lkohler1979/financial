import { AppError } from "../../shared/errors/app-error";

// Cliente HTTP para a API do Asaas (boleto) — fetch nativo, mesmo padrão já
// usado em sincronizacao-legado/legado-client.ts (sem axios no projeto).
// Docs: https://docs.asaas.com/reference — autenticação via header
// `access_token`, ambientes sandbox/produção com base URLs distintas.

const BASE_URLS: Record<"SANDBOX" | "PRODUCAO", string> = {
  SANDBOX: "https://api-sandbox.asaas.com/v3",
  PRODUCAO: "https://api.asaas.com/v3",
};

export interface AsaasClienteConfig {
  apiKey: string;
  ambiente: "SANDBOX" | "PRODUCAO";
}

export interface AsaasCriarClienteInput {
  name: string;
  cpfCnpj: string;
  email?: string;
  mobilePhone?: string;
  externalReference?: string;
}

export interface AsaasCliente {
  id: string;
}

export type AsaasBillingType = "BOLETO" | "PIX" | "CREDIT_CARD";

export interface AsaasCriarCobrancaInput {
  customer: string;
  billingType: AsaasBillingType;
  value: number;
  /** Formato YYYY-MM-DD, exigido pela API do Asaas. */
  dueDate: string;
  description?: string;
  externalReference?: string;
}

export interface AsaasCobranca {
  id: string;
  status: string;
  bankSlipUrl: string | null;
  invoiceUrl: string | null;
}

export interface AsaasLinhaDigitavel {
  identificationField: string;
  barCode: string;
}

export interface AsaasPixQrCode {
  encodedImage: string;
  payload: string;
  expirationDate: string | null;
}

interface AsaasErroResposta {
  errors?: Array<{ description?: string }>;
}

export class AsaasClient {
  constructor(private readonly config: AsaasClienteConfig) {}

  private async requisitar<T>(caminho: string, init: RequestInit = {}): Promise<T> {
    const resposta = await fetch(`${BASE_URLS[this.config.ambiente]}${caminho}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        access_token: this.config.apiKey,
        ...init.headers,
      },
    });

    const corpo = await resposta.json().catch(() => null);

    if (!resposta.ok) {
      const erro = corpo as AsaasErroResposta | null;
      const mensagem =
        erro?.errors?.[0]?.description ?? `Asaas respondeu ${resposta.status} para ${caminho}`;
      throw new AppError(mensagem, 502, "ASAAS_ERRO", corpo);
    }

    return corpo as T;
  }

  criarCliente(dados: AsaasCriarClienteInput): Promise<AsaasCliente> {
    return this.requisitar<AsaasCliente>("/customers", {
      method: "POST",
      body: JSON.stringify(dados),
    });
  }

  /**
   * `billingType: "CREDIT_CARD"` aqui NUNCA deve vir acompanhado dos dados do
   * cartão (número/CVV) — de propósito: o Ethos não coleta nem transmite
   * dado de cartão (isso exigiria compliance PCI-DSS). O cliente paga pela
   * `invoiceUrl` devolvida, que é a página segura hospedada pelo próprio
   * Asaas (docs/cobrancas-via-cartao-de-credito).
   */
  criarCobranca(dados: AsaasCriarCobrancaInput): Promise<AsaasCobranca> {
    return this.requisitar<AsaasCobranca>("/payments", {
      method: "POST",
      body: JSON.stringify(dados),
    });
  }

  /** Recupera a linha digitável/código de barras depois de criar a cobrança —
   * o próprio Asaas recomenda buscar separadamente em vez de confiar num
   * valor devolvido na criação (docs/cobrancas-via-boleto). */
  obterLinhaDigitavel(paymentId: string): Promise<AsaasLinhaDigitavel> {
    return this.requisitar<AsaasLinhaDigitavel>(
      `/payments/${encodeURIComponent(paymentId)}/identificationField`,
    );
  }

  /** QR Code (imagem base64 + copia-e-cola) de uma cobrança Pix — só
   * disponível depois de criar a cobrança com billingType "PIX"
   * (docs/cobrancas-via-pix). */
  obterQrCodePix(paymentId: string): Promise<AsaasPixQrCode> {
    return this.requisitar<AsaasPixQrCode>(`/payments/${encodeURIComponent(paymentId)}/pixQrCode`);
  }
}
