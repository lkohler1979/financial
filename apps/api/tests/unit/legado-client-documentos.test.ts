import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LegadoClient, semZerosId } from "../../src/modules/sincronizacao-legado/legado-client";

/** Responde ao login (cookie) e entrega, em ordem, as respostas das chamadas seguintes. */
function mockFetch(respostas: Array<() => Response>) {
  const chamadas: { url: string; init?: RequestInit }[] = [];
  const fila = [...respostas];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      chamadas.push({ url, init });
      if (url.endsWith("/acesso/autenticacao/login")) {
        return new Response(null, {
          status: 302,
          headers: { "set-cookie": "PHPSESSID=abc123; path=/" },
        });
      }
      const proxima = fila.shift();
      if (!proxima) throw new Error("chamada inesperada: " + url);
      return proxima();
    }),
  );
  return chamadas;
}

const json = (corpo: unknown) => () => new Response(JSON.stringify(corpo), { status: 200 });
const cliente = () =>
  new LegadoClient({ baseUrl: "https://legado.test", usuario: "u", senha: "s" });
const corpoDe = (c: { init?: RequestInit }) => String(c.init?.body);

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("semZerosId", () => {
  it("tira zeros à esquerda e preserva o zero sozinho", () => {
    expect(semZerosId("0000000007")).toBe("7");
    expect(semZerosId("46")).toBe("46");
    expect(semZerosId("0")).toBe("0");
  });
});

describe("LegadoClient — documentos do aluno", () => {
  it("listarTiposDocumento envia o grupo 'Documentos pessoais' com ids sem zeros e lê os tipos", async () => {
    const chamadas = mockFetch([
      json([
        {
          docgruporegra_id: "0000000003",
          docgrupo_id: "0000000001",
          tdoc_id: "0000000007",
          tdoc_descricao: "Comprovante de Residência",
          tdoc_chave_ged: "COMPROVANTE DE RESIDENCIA",
        },
      ]),
    ]);
    const tipos = await cliente().listarTiposDocumento("00000000046");

    expect(tipos).toEqual([
      {
        docgruporegraId: "0000000003",
        tdocId: "0000000007",
        descricao: "Comprovante de Residência",
        chaveGed: "COMPROVANTE DE RESIDENCIA",
      },
    ]);
    const req = chamadas[1];
    expect(req.url).toBe(
      "https://legado.test/documentos/documento-tipo/busca-tipo-documento-por-grupo",
    );
    const form = new URLSearchParams(corpoDe(req));
    expect(Object.fromEntries(form)).toEqual({
      docgrupoId: "1",
      docgruporegraRequerido: "'Aluno'",
      pesId: "46",
      alunocursoId: "",
      alunoperId: "",
    });
  });

  it("buscarDocumentoAluno lê situação, datas, observações e arquivos", async () => {
    const chamadas = mockFetch([
      json({
        arrDados: {
          arrDocumentoPessoa: {
            docpessoaSituacao: "Deferido",
            docpessoaSubmissao: "2021-06-14 17:07:32",
            docpessoaDeferido: "2021-06-22 18:50:30",
            docpessoaVencimento: null,
            validador: "Jeane Cristina",
            docpessoaObsInterna: "ok",
            docpessoaObsAluno: null,
          },
          arrArquivo: [
            {
              id: "0000000243",
              nome: "CPF.pdf",
              tipo: "application/pdf",
              tamanho: "1224472",
              chave: "bb07c968",
            },
            { id: "9", nome: "sem-chave" },
          ],
        },
      }),
    ]);
    const doc = await cliente().buscarDocumentoAluno("0000000027", {
      docgruporegraId: "0000000001",
      tdocId: "0000000001",
      descricao: "CPF",
      chaveGed: "CPF",
    });

    expect(doc).toEqual({
      situacao: "Deferido",
      submissao: "2021-06-14 17:07:32",
      deferido: "2021-06-22 18:50:30",
      vencimento: null,
      validador: "Jeane Cristina",
      obsInterna: "ok",
      obsAluno: null,
      // Arquivo sem chave não dá para baixar: é descartado.
      arquivos: [
        {
          id: "0000000243",
          nome: "CPF.pdf",
          mime: "application/pdf",
          tamanho: 1224472,
          chave: "bb07c968",
        },
      ],
    });
    expect(Object.fromEntries(new URLSearchParams(corpoDe(chamadas[1])))).toMatchObject({
      alunoId: "27",
      tdocId: "1",
      docgruporegraId: "1",
      tdocChaveGed: "CPF",
      docgrupoId: "1",
    });
  });

  it("sem entrega o legado manda lista vazia e o resultado é null", async () => {
    mockFetch([json({ arrDados: { arrDocumentoPessoa: [] } })]);
    const doc = await cliente().buscarDocumentoAluno("27", {
      docgruporegraId: "1",
      tdocId: "1",
      descricao: "CPF",
      chaveGed: "CPF",
    });
    expect(doc).toBeNull();
  });

  describe("baixarArquivo", () => {
    it("devolve os bytes e chama a URL de download com a chave", async () => {
      const chamadas = mockFetch([
        () =>
          new Response(Buffer.from("%PDF-1.4 conteudo"), {
            status: 200,
            headers: { "content-type": "octet/stream" },
          }),
      ]);
      const arquivo = await cliente().baixarArquivo("105fc912", 17);
      expect(arquivo.toString()).toBe("%PDF-1.4 conteudo");
      expect(chamadas[1].url).toBe(
        "https://legado.test/gerenciador-arquivos/arquivo/download/105fc912",
      );
    });

    it("recusa a página HTML que o legado devolve (com status 200) para chave inválida", async () => {
      mockFetch([
        () =>
          new Response("<!DOCTYPE html><html>erro</html>", {
            status: 200,
            headers: { "content-type": "text/html; charset=UTF-8" },
          }),
      ]);
      await expect(cliente().baixarArquivo("chave-inexistente")).rejects.toThrow(
        /não devolveu o arquivo/,
      );
    });

    it("recusa arquivo incompleto (bytes diferentes do informado)", async () => {
      mockFetch([
        () =>
          new Response(Buffer.from("curto"), {
            status: 200,
            headers: { "content-type": "octet/stream" },
          }),
      ]);
      await expect(cliente().baixarArquivo("k", 1000)).rejects.toThrow(
        /Arquivo incompleto: baixou 5 bytes, o legado informa 1000/,
      );
    });
  });
});
