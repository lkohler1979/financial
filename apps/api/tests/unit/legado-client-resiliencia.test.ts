import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LegadoClient } from "../../src/modules/sincronizacao-legado/legado-client";
import { varrerPessoasDoLegado } from "../../src/modules/sincronizacao-legado/legado-varredura";

/**
 * Legado simulado: o login devolve o cookie; cada busca por nome consulta um "roteiro" que diz,
 * para (termo, nº da tentativa daquele termo), o que acontece: 200, um status de erro ou `null`
 * (a rede caiu: o fetch rejeita).
 */
type Passo = null | number;

function legadoSimulado(roteiro: (termo: string, tentativa: number) => Passo) {
  const consultas: string[] = [];
  const tentativas = new Map<string, number>();
  let logins = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/acesso/autenticacao/login")) {
        logins += 1;
        return new Response(null, {
          status: 302,
          headers: { "set-cookie": "PHPSESSID=abc123; path=/" },
        });
      }
      const termo = new URL(url).searchParams.get("query") ?? "";
      const n = (tentativas.get(termo) ?? 0) + 1;
      tentativas.set(termo, n);
      consultas.push(termo);
      const passo = roteiro(termo, n);
      if (passo === null) throw new TypeError("fetch failed");
      if (passo !== 200) return new Response("erro", { status: passo });
      return new Response(
        JSON.stringify([{ pes_id: `p-${termo}`, pes_nome: termo, alunocurso_id: `ac-${termo}` }]),
        { status: 200 },
      );
    }),
  );
  return { consultas, logins: () => logins };
}

const novoCliente = () =>
  new LegadoClient({ baseUrl: "https://legado.test", usuario: "u", senha: "s" });

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("LegadoClient — pausa e nova tentativa quando o legado falha", () => {
  it("HTTP 503: espera 1 minuto e repete a mesma consulta, devolvendo o resultado", async () => {
    const legado = legadoSimulado((_, n) => (n === 1 ? 503 : 200));
    const dormir = vi.fn(async () => undefined);
    const aoEsperar = vi.fn();

    const linhas = await novoCliente()
      .comResiliencia({ dormir, aoEsperar })
      .buscarPessoasPorPrefixoNome("ma");

    expect(linhas.map((l) => l.nome)).toEqual(["ma"]);
    expect(legado.consultas).toEqual(["ma", "ma"]);
    expect(dormir).toHaveBeenCalledTimes(1);
    expect(dormir).toHaveBeenCalledWith(60_000);
    expect(aoEsperar).toHaveBeenCalledTimes(1);
    expect(aoEsperar).toHaveBeenCalledWith({
      tentativa: 1,
      esperaMs: 60_000,
      motivo: expect.stringContaining("Sistema legado respondeu 503"),
    });
  });

  it("rede caída (fetch rejeita): também espera e repete, e reautentica", async () => {
    const legado = legadoSimulado((_, n) => (n === 1 ? null : 200));
    const dormir = vi.fn(async () => undefined);

    const linhas = await novoCliente().comResiliencia({ dormir }).buscarPessoasPorPrefixoNome("jo");

    expect(linhas).toHaveLength(1);
    expect(dormir).toHaveBeenCalledTimes(1);
    expect(legado.logins()).toBe(2); // a sessão é renovada depois da queda
  });

  it("429 e 408 também são tratados como falha passageira", async () => {
    for (const status of [429, 408]) {
      legadoSimulado((_, n) => (n === 1 ? status : 200));
      const dormir = vi.fn(async () => undefined);
      await novoCliente().comResiliencia({ dormir }).buscarPessoasPorPrefixoNome("a");
      expect(dormir).toHaveBeenCalledTimes(1);
    }
  });

  it("falha várias vezes seguidas: espera a cada uma e conta as tentativas", async () => {
    legadoSimulado((_, n) => (n <= 3 ? 502 : 200));
    const tentativas: number[] = [];

    await novoCliente()
      .comResiliencia({
        dormir: async () => undefined,
        aoEsperar: (i) => tentativas.push(i.tentativa),
      })
      .buscarPessoasPorPrefixoNome("a");

    expect(tentativas).toEqual([1, 2, 3]);
  });

  it("desiste depois de maxEsperas pausas e devolve o erro do legado", async () => {
    const legado = legadoSimulado(() => 503);
    const dormir = vi.fn(async () => undefined);

    await expect(
      novoCliente().comResiliencia({ dormir, maxEsperas: 2 }).buscarPessoasPorPrefixoNome("a"),
    ).rejects.toThrow("Sistema legado respondeu 503");

    expect(dormir).toHaveBeenCalledTimes(2);
    expect(legado.consultas).toHaveLength(3); // a primeira + 2 repetições
  });

  it("erro que não passa sozinho (404) não é repetido nem faz pausa", async () => {
    const legado = legadoSimulado(() => 404);
    const dormir = vi.fn(async () => undefined);

    await expect(
      novoCliente().comResiliencia({ dormir }).buscarPessoasPorPrefixoNome("a"),
    ).rejects.toThrow("respondeu 404");

    expect(dormir).not.toHaveBeenCalled();
    expect(legado.consultas).toHaveLength(1);
  });

  it("sem resiliência (telas, consulta por CPF) a falha sobe na hora, sem esperar", async () => {
    const legado = legadoSimulado(() => 503);

    await expect(novoCliente().buscarPessoasPorPrefixoNome("a")).rejects.toThrow("respondeu 503");

    expect(legado.consultas).toHaveLength(1);
  });

  it("timeout da requisição conta como falha passageira", async () => {
    let chamadas = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith("/acesso/autenticacao/login")) {
          return new Response(null, {
            status: 302,
            headers: { "set-cookie": "PHPSESSID=x; path=/" },
          });
        }
        chamadas += 1;
        if (chamadas === 1) {
          // legado pendurado: só termina quando o timeout aborta
          return new Promise<Response>((_, rejeitar) =>
            init?.signal?.addEventListener("abort", () => rejeitar(init.signal?.reason)),
          );
        }
        return new Response("[]", { status: 200 });
      }),
    );
    const dormir = vi.fn(async () => undefined);

    const linhas = await novoCliente()
      .comResiliencia({ dormir, timeoutMs: 20 })
      .buscarPessoasPorPrefixoNome("a");

    expect(linhas).toEqual([]);
    expect(dormir).toHaveBeenCalledTimes(1);
  });
});

describe("varredura do legado — segue de onde parou depois de uma queda", () => {
  it("o legado cai no meio da varredura: espera, refaz a consulta que falhou e não pula nem repete nenhuma", async () => {
    // Cai (rede) na consulta "c" e responde 503 duas vezes na "f".
    const legado = legadoSimulado((termo, n) => {
      if (termo === "c" && n === 1) return null;
      if (termo === "f" && n <= 2) return 503;
      return 200;
    });
    const dormir = vi.fn(async () => undefined);
    const cliente = novoCliente().comResiliencia({ dormir });

    const resultado = await varrerPessoasDoLegado((p) => cliente.buscarPessoasPorPrefixoNome(p), {
      limite: 8,
    });

    // As 8 primeiras pessoas (a..h), na ordem, cada uma uma vez; só "c" e "f" foram refeitas.
    expect([...resultado.pessoas.keys()]).toEqual(
      ["a", "b", "c", "d", "e", "f", "g", "h"].map((l) => `p-${l}`),
    );
    expect(legado.consultas).toEqual(["a", "b", "c", "c", "d", "e", "f", "f", "f", "g", "h"]);
    expect(dormir).toHaveBeenCalledTimes(3);
    expect(dormir).toHaveBeenCalledWith(60_000);
  });
});
