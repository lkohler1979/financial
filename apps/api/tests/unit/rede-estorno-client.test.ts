import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RedeClient } from "../../src/modules/rede/rede-client";
import { AppError } from "../../src/shared/errors/app-error";

describe("RedeClient — estorno", () => {
  const cliente = new RedeClient({ pv: "PVESTORNO", chaveIntegracao: "chave", ambiente: "SANDBOX" });
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const resp = (status: number, corpo: unknown) =>
    Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => corpo });
  const rotear = (transacao: () => Promise<unknown>) =>
    fetchMock.mockImplementation((url: string) =>
      url.includes("oauth2/token") ? resp(200, { access_token: "tok", expires_in: 1440 }) : transacao(),
    );
  const chamada = () => fetchMock.mock.calls.find(([u]) => !String(u).includes("oauth2"))!;

  it("359: estorno concluído na hora; envia o valor em centavos para /{tid}/refunds", async () => {
    rotear(() => resp(200, { returnCode: "359", returnMessage: "Refund successful", refundId: "r-1" }));
    const r = await cliente.estornarCartao("10012610061349111724", 15000);
    expect(chamada()[0]).toBe("https://sandbox-erede.useredecloud.com.br/v2/transactions/10012610061349111724/refunds");
    expect(chamada()[1].method).toBe("POST");
    expect(JSON.parse(chamada()[1].body)).toEqual({ amount: 15000 });
    expect(r).toMatchObject({ concluido: true, refundId: "r-1" });
  });

  it("360: aceito, mas ainda em processamento (D+1)", async () => {
    rotear(() => resp(200, { returnCode: "360", returnMessage: "Refund request has been successful", refundId: "r-2" }));
    expect((await cliente.estornarCartao("T1", 100)).concluido).toBe(false);
  });

  it.each([
    ["354", "Transaction with period expired for refund"],
    ["355", "Transaction already canceled."],
    ["374", "Refund not allowed. Chargeback requested"],
  ])("%s: vira erro 422 com a mensagem da Rede", async (codigo, mensagem) => {
    rotear(() => resp(400, { returnCode: codigo, returnMessage: mensagem }));
    const erro = await cliente.estornarCartao("T1", 100).catch((e) => e);
    expect(erro).toBeInstanceOf(AppError);
    expect(erro).toMatchObject({ statusCode: 422, codigo: "REDE_ESTORNO_RECUSADO" });
    expect(erro.message).toContain(mensagem);
  });

  it("consulta os estornos da transação", async () => {
    rotear(() => resp(200, { refunds: [{ refundId: "r-2", status: "Done", amount: 100 }] }));
    expect(await cliente.consultarEstornos("T1")).toEqual([{ refundId: "r-2", status: "Done", amount: 100 }]);
    expect(chamada()[1].method).toBe("GET");
  });
});

