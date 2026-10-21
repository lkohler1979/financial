import { AppError } from "../../../shared/errors/app-error";
import type { ProvedorDeAssinatura, RegrasWebhook, Signatario } from "./tipos";

const URL_API = "https://api.autentique.com.br/v2/graphql";

interface RespostaGraphql<T> {
  data?: T;
  errors?: { message: string }[];
}

/** Telefone no formato internacional que a Autentique exige (+55DDDNÚMERO). */
export function telefoneInternacional(telefone?: string): string | undefined {
  const d = (telefone ?? "").replace(/\D/g, "");
  if (d.length < 10) return undefined;
  return d.startsWith("55") && d.length >= 12 ? `+${d}` : `+55${d}`;
}

/** Cliente da API GraphQL v2 da Autentique. O token vai como Bearer. */
export class AutentiqueClient {
  constructor(
    private readonly token: string,
    private readonly sandbox: boolean,
  ) {}

  private async chamar<T>(corpo: string | FormData, json = false): Promise<T> {
    const resposta = await fetch(URL_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(json ? { "Content-Type": "application/json" } : {}),
      },
      body: corpo,
    });
    const texto = await resposta.text();
    if (resposta.status === 401 || resposta.status === 403) {
      throw new AppError(
        "A Autentique recusou o token — confira o token em Configurações.",
        502,
        "AUTENTIQUE_ERRO",
      );
    }
    let dados: RespostaGraphql<T>;
    try {
      dados = JSON.parse(texto) as RespostaGraphql<T>;
    } catch {
      throw new AppError(
        `Autentique respondeu ${resposta.status}: ${texto.slice(0, 300)}`,
        502,
        "AUTENTIQUE_ERRO",
      );
    }
    if (!resposta.ok || dados.errors?.length || !dados.data) {
      const mensagem = dados.errors?.map((e) => e.message).join("; ") ?? `HTTP ${resposta.status}`;
      throw new AppError(`Autentique: ${mensagem}`, 502, "AUTENTIQUE_ERRO");
    }
    return dados.data;
  }

  /** Cria o documento (upload multipart, padrão graphql-multipart-request-spec). */
  async criarDocumento(opcoes: {
    nome: string;
    filename: string;
    arquivo: Buffer;
    mime: string;
    signatarios: Record<string, unknown>[];
    qualificada: boolean;
  }): Promise<string> {
    const query = `mutation CriarDocumento($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!) {
      createDocument(document: $document, signers: $signers, file: $file${this.sandbox ? ", sandbox: true" : ""}) {
        id
      }
    }`;
    const form = new FormData();
    form.append(
      "operations",
      JSON.stringify({
        query,
        variables: {
          document: {
            name: opcoes.nome,
            refusable: true,
            reminder: "WEEKLY",
            ...(opcoes.qualificada ? { qualified: true } : {}),
          },
          signers: opcoes.signatarios,
          file: null,
        },
      }),
    );
    form.append("map", JSON.stringify({ file: ["variables.file"] }));
    form.append(
      "file",
      new Blob([new Uint8Array(opcoes.arquivo)], { type: opcoes.mime }),
      opcoes.filename,
    );
    const r = await this.chamar<{ createDocument: { id: string } }>(form);
    return r.createDocument.id;
  }

  async urlAssinado(documentoId: string): Promise<string | null> {
    const r = await this.chamar<{ document: { files: { signed: string | null } } }>(
      JSON.stringify({
        query: `query { document(id: ${JSON.stringify(documentoId)}) { files { signed } } }`,
      }),
      true,
    );
    return r.document?.files?.signed ?? null;
  }

  async excluirDocumento(documentoId: string): Promise<void> {
    await this.chamar(
      JSON.stringify({ query: `mutation { deleteDocument(id: ${JSON.stringify(documentoId)}) }` }),
      true,
    );
  }

  async baixar(url: string): Promise<Buffer | null> {
    // O link é do próprio serviço da Autentique; envia o token só se for do mesmo domínio.
    const mesmoDominio = /^https:\/\/([a-z0-9-]+\.)*autentique\.com\.br\//i.test(url);
    const r = await fetch(
      url,
      mesmoDominio ? { headers: { Authorization: `Bearer ${this.token}` } } : {},
    );
    return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
  }
}

function paraSignatarioAutentique(
  s: Signatario,
  entrega: "EMAIL" | "SMS" | "WHATSAPP",
): Record<string, unknown> {
  const telefone = telefoneInternacional(s.telefone);
  if (entrega !== "EMAIL" && telefone) {
    return {
      name: s.nome,
      phone: telefone,
      delivery_method: entrega === "SMS" ? "DELIVERY_METHOD_SMS" : "DELIVERY_METHOD_WHATSAPP",
      action: "SIGN",
    };
  }
  return { name: s.nome, email: s.email, action: "SIGN" };
}

export function criarProvedorAutentique(token: string, sandbox: boolean): ProvedorDeAssinatura {
  const cliente = new AutentiqueClient(token, sandbox);
  return {
    id: "AUTENTIQUE",
    nome: "Autentique",

    async enviar(d) {
      const entrega =
        d.autenticacao === "SMS" ? "SMS" : d.autenticacao === "WHATSAPP" ? "WHATSAPP" : "EMAIL";
      const signatarios = [paraSignatarioAutentique(d.contratante, entrega)];
      if (d.escola) signatarios.push(paraSignatarioAutentique(d.escola, "EMAIL"));
      const documentoId = await cliente.criarDocumento({
        nome: d.nomeDocumento,
        filename: d.filename,
        arquivo: d.arquivo,
        mime: d.mime,
        signatarios,
        // A Autentique não tem "ICP-Brasil" por signatário: o equivalente é a assinatura
        // qualificada (com certificado digital), ligada no documento todo.
        qualificada: d.autenticacao === "ICP_BRASIL",
      });
      return { envelopeId: null, documentoId };
    },

    async baixarAssinado(ref) {
      const url = await cliente.urlAssinado(ref.documentoId);
      return url ? cliente.baixar(url) : null;
    },

    cancelar: (ref) => cliente.excluirDocumento(ref.documentoId),
  };
}

export const regrasWebhookAutentique: RegrasWebhook = {
  headerAssinatura: "x-autentique-signature",
  interpretar(payload) {
    const tipo = (payload as { event?: { type?: string } })?.event?.type;
    if (tipo === "document.finished") return "FINALIZADO";
    if (tipo === "signature.rejected") return "RECUSADO";
    if (tipo === "document.deleted") return "CANCELADO";
    return null;
  },
};
