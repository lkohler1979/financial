import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { luhnValido, normalizarNomePortador, validadeNaoVencida } from "../../src/shared/utils/cartao";
import { LimitadorTentativas } from "../../src/shared/utils/limitador";
import { pagamentoCartaoSchema } from "../../src/modules/rede/rede.schema";
import { RedeClient } from "../../src/modules/rede/rede-client";
import { AppError } from "../../src/shared/errors/app-error";

describe("utilitários de cartão", () => {
  it("Luhn: aceita os cartões de teste da Rede e recusa número errado", () => {
    for (const n of ["5448280000000007", "4235647728025682", "371341553758128", "4389351648020055"]) {
      expect(luhnValido(n)).toBe(true);
    }
    expect(luhnValido("5448280000000008")).toBe(false);
    expect(luhnValido("1234")).toBe(false);
    expect(luhnValido("abcd5448280000000")).toBe(false);
  });

  it("validade vale até o fim do mês", () => {
    const hoje = new Date(2026, 9, 15); // 15/10/2026
    expect(validadeNaoVencida(10, 2026, hoje)).toBe(true);
    expect(validadeNaoVencida(9, 2026, hoje)).toBe(false);
    expect(validadeNaoVencida(1, 2035, hoje)).toBe(true);
    expect(validadeNaoVencida(13, 2035, hoje)).toBe(false);
  });

  it("nome do portador sem acento/especiais e até 30 caracteres", () => {
    expect(normalizarNomePortador("  José d'Ávila-Çãe   Júnior ")).toBe("Jose dAvilaCae Junior");
    expect(normalizarNomePortador("A".repeat(50))).toHaveLength(30);
  });
});

describe("pagamentoCartaoSchema", () => {
  const base = { numero: "5448 2800 0000 0007", nome: "Maria da Silva", mes: "01", ano: "35", cvv: "123" };

  it("normaliza número, ano de 2 dígitos e parcelas padrão", () => {
    const r = pagamentoCartaoSchema.parse(base);
    expect(r).toMatchObject({ numero: "5448280000000007", ano: 2035, mes: 1, parcelas: 1 });
  });

  it("recusa cartão inválido, vencido, CVV ruim e parcelas fora de 1–12", () => {
    expect(pagamentoCartaoSchema.safeParse({ ...base, numero: "5448280000000008" }).success).toBe(false);
    expect(pagamentoCartaoSchema.safeParse({ ...base, ano: "2020" }).success).toBe(false);
    expect(pagamentoCartaoSchema.safeParse({ ...base, cvv: "12" }).success).toBe(false);
    expect(pagamentoCartaoSchema.safeParse({ ...base, parcelas: 13 }).success).toBe(false);
    expect(pagamentoCartaoSchema.safeParse({ ...base, mes: "13" }).success).toBe(false);
  });

  it("a mensagem de erro de validação não repete o número do cartão", () => {
    const r = pagamentoCartaoSchema.safeParse({ ...base, numero: "5448280000000008" });
    expect(JSON.stringify(r.success ? {} : r.error.issues)).not.toContain("5448280000000008");
  });
});

describe("LimitadorTentativas", () => {
  it("bloqueia após o máximo, libera depois da janela e zera ao limpar", () => {
    const l = new LimitadorTentativas(2, 1000);
    l.registrarFalha("k", 0);
    expect(l.bloqueado("k", 10)).toBe(false);
    l.registrarFalha("k", 20);
    expect(l.bloqueado("k", 30)).toBe(true);
    expect(l.bloqueado("k", 2000)).toBe(false);
    l.registrarFalha("x", 0);
    l.registrarFalha("x", 0);
    l.limpar("x");
    expect(l.bloqueado("x", 1)).toBe(false);
  });
});

describe("RedeClient.criarCobrancaCartao", () => {
  const cliente = new RedeClient({ pv: "PVTESTE", chaveIntegracao: "chave", ambiente: "SANDBOX" });
  const dados = {
    reference: "PABC123",
    amount: 12345,
    installments: 1,
    cardholderName: "MARIA SILVA",
    cardNumber: "5448280000000007",
    expirationMonth: 1,
    expirationYear: 2035,
    securityCode: "123",
  };
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const resp = (status: number, corpo: unknown) =>
    Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => corpo });
  // O token OAuth fica em cache entre chamadas: roteia o mock por URL em vez de por ordem.
  const rotear = (transacao: () => Promise<unknown>) =>
    fetchMock.mockImplementation((url: string) =>
      url.includes("oauth2/token") ? resp(200, { access_token: "tok", expires_in: 1440 }) : transacao(),
    );
  const chamadaTransacao = () => fetchMock.mock.calls.find(([u]) => !String(u).includes("oauth2"))!;

  it("envia crédito com captura automática e interpreta a aprovação", async () => {
    rotear(() =>
      resp(200, {
        returnCode: "00",
        returnMessage: "Success.",
        tid: "8345000363484052380",
        nsu: "663206341",
        authorizationCode: "186376",
        cardBin: "544828",
        last4: "0007",
        brand: { name: "Mastercard." },
      }),
    );

    const r = await cliente.criarCobrancaCartao(dados);

    const [url, init] = chamadaTransacao();
    expect(url).toBe("https://sandbox-erede.useredecloud.com.br/v2/transactions");
    const corpo = JSON.parse(init.body);
    expect(corpo).toMatchObject({ capture: true, kind: "credit", amount: 12345, cardNumber: "5448280000000007", expirationYear: 2035 });
    expect(corpo).not.toHaveProperty("installments"); // à vista não envia o campo
    expect(init.headers.authorization).toBe("Bearer tok");
    expect(r).toMatchObject({ aprovado: true, tid: "8345000363484052380", bandeira: "Mastercard", final: "0007" });
  });

  it("parcelado envia installments (2 a 12)", async () => {
    rotear(() => resp(200, { returnCode: "00", tid: "1" }));
    await cliente.criarCobrancaCartao({ ...dados, installments: 3 });
    expect(JSON.parse(chamadaTransacao()[1].body).installments).toBe(3);
  });

  it("recusa do emissor volta aprovado:false sem lançar erro", async () => {
    rotear(() =>
      resp(200, { returnCode: "101", returnMessage: "Unauthorized. Problems on the card, contact the issuer.", tid: "9" }),
    );
    const r = await cliente.criarCobrancaCartao(dados);
    expect(r.aprovado).toBe(false);
    expect(r.returnCode).toBe("101");
  });

  it("HTTP de erro sem returnCode vira erro 502 que não vaza o cartão", async () => {
    rotear(() => resp(500, {}));
    const erro = await cliente.criarCobrancaCartao(dados).catch((e) => e);
    expect(erro).toBeInstanceOf(AppError);
    expect(erro.statusCode).toBe(502);
    expect(JSON.stringify({ m: erro.message, d: erro.detalhes })).not.toContain("5448280000000007");
  });
});
