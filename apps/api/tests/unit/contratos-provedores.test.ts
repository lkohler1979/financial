import { afterEach, describe, expect, it, vi } from "vitest";
import {
  criarProvedorAutentique,
  regrasWebhookAutentique,
  situacaoDasAssinaturas,
  telefoneInternacional,
} from "../../src/modules/contratos/provedores/autentique.provider";
import { regrasWebhookClicksign } from "../../src/modules/contratos/provedores/clicksign.provider";
import type { DadosEnvio } from "../../src/modules/contratos/provedores/tipos";

const contratante = {
  nome: "Maria da Silva",
  email: "maria@exemplo.com",
  cpf: "123.456.789-09",
  telefone: "(54) 99999-1234",
};

function dados(extra: Partial<DadosEnvio> = {}): DadosEnvio {
  return {
    nomeDocumento: "Contrato - Maria",
    filename: "contrato.docx",
    arquivo: Buffer.from("conteudo"),
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    autenticacao: "EMAIL",
    contratante,
    ...extra,
  };
}

function responderJson(corpo: unknown, status = 200) {
  return { ok: status < 400, status, text: async () => JSON.stringify(corpo) };
}

afterEach(() => vi.unstubAllGlobals());

describe("telefoneInternacional", () => {
  it("formata para +55", () => {
    expect(telefoneInternacional("(54) 99999-1234")).toBe("+5554999991234");
    expect(telefoneInternacional("5554999991234")).toBe("+5554999991234");
  });
  it("recusa número curto", () => {
    expect(telefoneInternacional("1234")).toBeUndefined();
  });
});

describe("provedor Autentique", () => {
  it("envia o documento em multipart com Bearer, sandbox e signatário por e-mail", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(responderJson({ data: { createDocument: { id: "doc123" } } }));
    vi.stubGlobal("fetch", fetchMock);

    const ref = await criarProvedorAutentique("tok", true).enviar(dados());

    expect(ref).toEqual({ envelopeId: null, documentoId: "doc123" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.autentique.com.br/v2/graphql");
    expect(init.headers.Authorization).toBe("Bearer tok");
    const form = init.body as FormData;
    const operations = JSON.parse(form.get("operations") as string);
    expect(operations.query).toContain("sandbox: true");
    expect(operations.variables.signers).toEqual([
      { name: "Maria da Silva", email: "maria@exemplo.com", action: "SIGN" },
    ]);
    expect(operations.variables.document.qualified).toBeUndefined();
    expect(JSON.parse(form.get("map") as string)).toEqual({ file: ["variables.file"] });
    expect((form.get("file") as File).name).toBe("contrato.docx");
  });

  it("produção não usa sandbox; ICP-Brasil liga a assinatura qualificada; WhatsApp vai por telefone", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(responderJson({ data: { createDocument: { id: "d" } } }));
    vi.stubGlobal("fetch", fetchMock);

    await criarProvedorAutentique("tok", false).enviar(
      dados({
        autenticacao: "ICP_BRASIL",
        escola: { nome: "Diretora Escola", email: "dir@escola.com", cpf: "1" },
      }),
    );
    let ops = JSON.parse((fetchMock.mock.calls[0][1].body as FormData).get("operations") as string);
    expect(ops.query).not.toContain("sandbox");
    expect(ops.variables.document.qualified).toBe(true);
    expect(ops.variables.signers).toHaveLength(2);

    await criarProvedorAutentique("tok", false).enviar(dados({ autenticacao: "WHATSAPP" }));
    ops = JSON.parse((fetchMock.mock.calls[1][1].body as FormData).get("operations") as string);
    expect(ops.variables.signers[0]).toEqual({
      name: "Maria da Silva",
      phone: "+5554999991234",
      delivery_method: "DELIVERY_METHOD_WHATSAPP",
      action: "SIGN",
    });
  });

  it("transforma erro GraphQL em mensagem", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(responderJson({ errors: [{ message: "limite de documentos" }] })),
    );
    await expect(criarProvedorAutentique("tok", false).enviar(dados())).rejects.toThrow(
      /limite de documentos/,
    );
  });

  it("token recusado tem mensagem própria", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responderJson({}, 401)));
    await expect(criarProvedorAutentique("x", false).enviar(dados())).rejects.toThrow(/token/);
  });

  it("baixa o PDF assinado pelo link de files.signed; sem link devolve null", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        responderJson({
          data: { document: { files: { signed: "https://docs.autentique.com.br/a.pdf" } } },
        }),
      )
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode("pdf").buffer,
      });
    vi.stubGlobal("fetch", fetchMock);
    const pdf = await criarProvedorAutentique("tok", false).baixarAssinado({
      envelopeId: null,
      documentoId: "doc1",
    });
    expect(pdf?.toString()).toBe("pdf");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).query).toContain('document(id: "doc1")');

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(responderJson({ data: { document: { files: { signed: null } } } })),
    );
    expect(
      await criarProvedorAutentique("tok", false).baixarAssinado({
        envelopeId: null,
        documentoId: "d",
      }),
    ).toBeNull();
  });

  it("cancelar exclui o documento", async () => {
    const fetchMock = vi.fn().mockResolvedValue(responderJson({ data: { deleteDocument: true } }));
    vi.stubGlobal("fetch", fetchMock);
    await criarProvedorAutentique("tok", false).cancelar({ envelopeId: null, documentoId: "d9" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).query).toBe(
      'mutation { deleteDocument(id: "d9") }',
    );
  });
});

describe("leitura dos eventos de webhook", () => {
  it("Autentique", () => {
    const e = (type: string) => regrasWebhookAutentique.interpretar({ event: { type } });
    expect(e("document.finished")).toBe("FINALIZADO");
    expect(e("signature.rejected")).toBe("RECUSADO");
    expect(e("document.deleted")).toBe("CANCELADO");
    expect(e("document.updated")).toBe("ATUALIZADO");
    expect(e("document.created")).toBeNull();
    expect(regrasWebhookAutentique.headerAssinatura).toBe("x-autentique-signature");
  });

  it("Clicksign", () => {
    const e = (name: string) => regrasWebhookClicksign.interpretar({ event: { name } });
    expect(e("document_closed")).toBe("FINALIZADO");
    expect(e("refusal")).toBe("RECUSADO");
    expect(e("cancel")).toBe("CANCELADO");
    expect(e("sign")).toBeNull();
    expect(regrasWebhookClicksign.headerAssinatura).toBe("content-hmac");
  });
});

describe("situacaoDasAssinaturas (Autentique)", () => {
  const sim = { created_at: "2026-10-21" };
  it("ignora o dono da conta (sem ação) e exige todos os signatários com ação", () => {
    const dono = { action: null, signed: null, rejected: null };
    const a = { action: { name: "SIGN" }, signed: null, rejected: null };
    expect(situacaoDasAssinaturas([dono, a])).toBe("PENDENTE");
    expect(situacaoDasAssinaturas([dono, { ...a, signed: sim }])).toBe("ASSINADO");
    expect(situacaoDasAssinaturas([{ ...a, signed: sim }, a])).toBe("PENDENTE");
  });
  it("uma recusa vence", () => {
    const a = { action: { name: "SIGN" }, signed: sim, rejected: null };
    const b = { action: { name: "SIGN" }, signed: null, rejected: sim };
    expect(situacaoDasAssinaturas([a, b])).toBe("RECUSADO");
  });
  it("sem signatários com ação fica pendente", () => {
    expect(situacaoDasAssinaturas([])).toBe("PENDENTE");
  });
});
