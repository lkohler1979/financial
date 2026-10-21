import { createHmac } from "node:crypto";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { localizarLinkAssinado } from "../../src/modules/contratos/clicksign-client";
import { verificarAssinaturaWebhook } from "../../src/modules/contratos/clicksign-webhook";
import { ehDocx, preencherModeloDocx } from "../../src/modules/contratos/contrato-modelo";

async function criarDocx(corpoXml: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<?xml version="1.0"?><w:document xmlns:w="w"><w:body>${corpoXml}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

async function lerTexto(docx: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(docx);
  const xml = await zip.file("word/document.xml")!.async("string");
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");
}

describe("preencherModeloDocx", () => {
  it("troca campos em um trecho só, ignorando maiúsculas", async () => {
    const docx = await criarDocx("<w:p><w:r><w:t>Aluno: [NomeAluno], CPF [CPF].</w:t></w:r></w:p>");
    const { arquivo, naoEncontrados } = await preencherModeloDocx(docx, {
      NOMEALUNO: "Maria da Silva",
      CPF: "123.456.789-09",
    });
    expect(await lerTexto(arquivo)).toBe("Aluno: Maria da Silva, CPF 123.456.789-09.");
    expect(naoEncontrados).toEqual([]);
  });

  it("troca campo que o Word quebrou em vários trechos", async () => {
    const docx = await criarDocx(
      "<w:p><w:r><w:t>Nome: [NOME</w:t></w:r><w:r><w:t>ALUNO</w:t></w:r><w:r><w:t>] fim</w:t></w:r></w:p>",
    );
    const { arquivo } = await preencherModeloDocx(docx, { NOMEALUNO: "Ana & Cia" });
    expect(await lerTexto(arquivo)).toBe("Nome: Ana &amp; Cia fim");
  });

  it("mantém campos desconhecidos e os informa", async () => {
    const docx = await criarDocx("<w:p><w:r><w:t>[XPTO] e [CPF]</w:t></w:r></w:p>");
    const { arquivo, naoEncontrados } = await preencherModeloDocx(docx, { CPF: "1" });
    expect(await lerTexto(arquivo)).toBe("[XPTO] e 1");
    expect(naoEncontrados).toEqual(["XPTO"]);
  });

  it("ehDocx reconhece o arquivo", async () => {
    expect(await ehDocx(await criarDocx("<w:p/>"))).toBe(true);
    expect(await ehDocx(Buffer.from("texto qualquer"))).toBe(false);
  });
});

describe("verificarAssinaturaWebhook", () => {
  const corpo = Buffer.from('{"event":{"name":"document_closed"}}');
  const hmac = createHmac("sha256", "segredo").update(corpo).digest("hex");

  it("aceita o HMAC correto, com ou sem prefixo", () => {
    expect(verificarAssinaturaWebhook(corpo, `sha256=${hmac}`, "segredo")).toBe(true);
    expect(verificarAssinaturaWebhook(corpo, hmac, "segredo")).toBe(true);
  });

  it("recusa segredo errado, corpo alterado ou header ausente", () => {
    expect(verificarAssinaturaWebhook(corpo, `sha256=${hmac}`, "outro")).toBe(false);
    expect(verificarAssinaturaWebhook(Buffer.from("{}"), `sha256=${hmac}`, "segredo")).toBe(false);
    expect(verificarAssinaturaWebhook(corpo, undefined, "segredo")).toBe(false);
  });
});

describe("localizarLinkAssinado", () => {
  it("acha o link em qualquer nível", () => {
    expect(
      localizarLinkAssinado({
        data: { attributes: { downloads: { signed_file_url: "/a/b.pdf" } } },
      }),
    ).toBe("/a/b.pdf");
    expect(
      localizarLinkAssinado({ data: { links: { files: { signed: "https://x/y.pdf" } } } }),
    ).toBe("https://x/y.pdf");
  });

  it("devolve null quando não há", () => {
    expect(localizarLinkAssinado({ data: { attributes: { status: "running" } } })).toBeNull();
  });
});
