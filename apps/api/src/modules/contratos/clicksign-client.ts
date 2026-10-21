import { AppError } from "../../shared/errors/app-error";

export type AmbienteClicksign = "SANDBOX" | "PRODUCAO";
export type AuthClicksign = "email" | "sms" | "whatsapp" | "icp_brasil";

const HOSTS: Record<AmbienteClicksign, string> = {
  SANDBOX: "https://sandbox.clicksign.com",
  PRODUCAO: "https://app.clicksign.com",
};

interface RecursoJsonApi {
  data: { id: string };
}

/** Cliente mínimo da API v3 da Clicksign (JSON:API). O token vai no header, sem "Bearer". */
export class ClicksignClient {
  private readonly host: string;

  constructor(
    private readonly token: string,
    ambiente: AmbienteClicksign,
  ) {
    this.host = HOSTS[ambiente];
  }

  private async requisitar<T>(
    metodo: string,
    caminho: string,
    corpo?: unknown,
    corpoAlternativo?: unknown,
  ): Promise<T> {
    const resposta = await fetch(`${this.host}/api/v3${caminho}`, {
      method: metodo,
      headers: {
        Authorization: this.token,
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const texto = await resposta.text();
    if (!resposta.ok) {
      if (corpoAlternativo !== undefined && (resposta.status === 400 || resposta.status === 422)) {
        return this.requisitar(metodo, caminho, corpoAlternativo);
      }
      const mensagem =
        resposta.status === 503
          ? "A conta Clicksign não tem o recurso de envelopes habilitado (API v3)."
          : resposta.status === 401 || resposta.status === 403
            ? "A Clicksign recusou o token — confira o token e o ambiente em Configurações."
            : `Clicksign respondeu ${resposta.status}: ${texto.slice(0, 400)}`;
      throw new AppError(mensagem, 502, "CLICKSIGN_ERRO");
    }
    return (texto ? JSON.parse(texto) : {}) as T;
  }

  async criarEnvelope(nome: string): Promise<string> {
    const r = await this.requisitar<RecursoJsonApi>("POST", "/envelopes", {
      data: {
        type: "envelopes",
        attributes: { name: nome, locale: "pt-BR", auto_close: true, remind_interval: 3 },
      },
    });
    return r.data.id;
  }

  async adicionarDocumento(
    envelopeId: string,
    filename: string,
    conteudo: Buffer,
    mime: string,
  ): Promise<string> {
    const montar = (base64: string) => ({
      data: { type: "documents", attributes: { filename, content_base64: base64 } },
    });
    const bruto = conteudo.toString("base64");
    const r = await this.requisitar<RecursoJsonApi>(
      "POST",
      `/envelopes/${envelopeId}/documents`,
      montar(bruto),
      // Se a conta exigir o formato "data URI", repete com o prefixo do tipo do arquivo.
      montar(`data:${mime};base64,${bruto}`),
    );
    return r.data.id;
  }

  async adicionarSignatario(
    envelopeId: string,
    s: { nome: string; email: string; cpf: string; telefone?: string; nascimento?: string },
  ): Promise<string> {
    const r = await this.requisitar<RecursoJsonApi>("POST", `/envelopes/${envelopeId}/signers`, {
      data: {
        type: "signers",
        attributes: {
          name: s.nome,
          email: s.email,
          documentation: s.cpf,
          has_documentation: true,
          ...(s.telefone ? { phone_number: s.telefone } : {}),
          ...(s.nascimento ? { birthday: s.nascimento } : {}),
          refusable: true,
          communicate_events: {
            document_signed: "email",
            signature_request: "email",
            signature_reminder: "email",
          },
        },
      },
    });
    return r.data.id;
  }

  async adicionarRequisitos(
    envelopeId: string,
    documentoId: string,
    signatarioId: string,
    auth: AuthClicksign,
  ): Promise<void> {
    const relationships = {
      document: { data: { type: "documents", id: documentoId } },
      signer: { data: { type: "signers", id: signatarioId } },
    };
    await this.requisitar("POST", `/envelopes/${envelopeId}/requirements`, {
      data: {
        type: "requirements",
        attributes: { action: "agree", role: "sign" },
        relationships,
      },
    });
    await this.requisitar("POST", `/envelopes/${envelopeId}/requirements`, {
      data: {
        type: "requirements",
        attributes: { action: "provide_evidence", auth },
        relationships,
      },
    });
  }

  async ativarEnvelope(envelopeId: string): Promise<void> {
    await this.requisitar("PATCH", `/envelopes/${envelopeId}`, {
      data: { type: "envelopes", id: envelopeId, attributes: { status: "running" } },
    });
  }

  async cancelarEnvelope(envelopeId: string): Promise<void> {
    await this.requisitar("PATCH", `/envelopes/${envelopeId}`, {
      data: { type: "envelopes", id: envelopeId, attributes: { status: "canceled" } },
    });
  }

  /**
   * Baixa o PDF assinado. O endereço fica no recurso do documento; como o nome exato do campo
   * varia entre versões da API, procura qualquer link "signed" na resposta. Devolve null se o
   * arquivo ainda não está disponível (a tela permite tentar de novo).
   */
  async baixarAssinado(envelopeId: string, documentoId: string): Promise<Buffer | null> {
    const r = await this.requisitar<unknown>(
      "GET",
      `/envelopes/${envelopeId}/documents/${documentoId}`,
    );
    const url = localizarLinkAssinado(r);
    if (!url) return null;
    const arquivo = await fetch(url.startsWith("http") ? url : `${this.host}${url}`);
    if (!arquivo.ok) return null;
    return Buffer.from(await arquivo.arrayBuffer());
  }
}

/** Procura, em qualquer nível, um campo cujo nome contenha "signed" com uma URL ou caminho. */
export function localizarLinkAssinado(valor: unknown): string | null {
  if (!valor || typeof valor !== "object") return null;
  for (const [chave, v] of Object.entries(valor as Record<string, unknown>)) {
    if (typeof v === "string" && /signed/i.test(chave) && /^(https?:\/\/|\/)/.test(v)) return v;
    const achado = localizarLinkAssinado(v);
    if (achado) return achado;
  }
  return null;
}
