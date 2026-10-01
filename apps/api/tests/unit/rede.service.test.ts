import { beforeEach, describe, expect, it, vi } from "vitest";
import { redeService } from "../../src/modules/rede/rede.service";
import { configuracoesRepository } from "../../src/modules/configuracoes/configuracoes.repository";
import { financeiroRepository } from "../../src/modules/financeiro/financeiro.repository";
import { financeiroService } from "../../src/modules/financeiro/financeiro.service";
import { sincronizacaoLegadoRepository } from "../../src/modules/sincronizacao-legado/sincronizacao-legado.repository";
import { AppError } from "../../src/shared/errors/app-error";

vi.mock("../../src/modules/configuracoes/configuracoes.repository", () => ({
  configuracoesRepository: { obterOuCriar: vi.fn() },
}));
vi.mock("../../src/modules/financeiro/financeiro.repository", () => ({
  financeiroRepository: { findByAsaasPaymentId: vi.fn() },
}));
vi.mock("../../src/modules/financeiro/financeiro.service", () => ({
  financeiroService: { atualizar: vi.fn() },
}));
vi.mock("../../src/modules/sincronizacao-legado/sincronizacao-legado.repository", () => ({
  sincronizacaoLegadoRepository: { obterUsuarioSistema: vi.fn() },
}));
vi.mock("../../src/shared/utils/criptografia", () => ({
  criptografar: vi.fn((v: string) => `cripto(${v})`),
  decifrar: vi.fn((v: string) => v.replace(/^cripto\(/, "").replace(/\)$/, "")),
}));

const configRepo = vi.mocked(configuracoesRepository);
const financeiro = vi.mocked(financeiroRepository);
const financeiroSvc = vi.mocked(financeiroService);
const legado = vi.mocked(sincronizacaoLegadoRepository);

const CONFIG_COM_TOKEN = { redeWebhookTokenCriptografado: "cripto(token-rede)" };

const parcelaFake = { id: "parcela-1", valor: 100 };

beforeEach(() => {
  vi.clearAllMocks();
  configRepo.obterOuCriar.mockResolvedValue(CONFIG_COM_TOKEN as never);
});

describe("redeService.processarWebhook", () => {
  it("rejeita quando o webhook não está configurado", async () => {
    configRepo.obterOuCriar.mockResolvedValue({ redeWebhookTokenCriptografado: null } as never);
    await expect(
      redeService.processarWebhook({ events: ["PV.UPDATE_TRANSACTION_PIX"] }, "Bearer token-rede"),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("rejeita token inválido", async () => {
    await expect(
      redeService.processarWebhook({ events: ["PV.UPDATE_TRANSACTION_PIX"] }, "Bearer token-errado"),
    ).rejects.toBeInstanceOf(AppError);
    expect(financeiroSvc.atualizar).not.toHaveBeenCalled();
  });

  it("ignora evento diferente de PV.UPDATE_TRANSACTION_PIX", async () => {
    await redeService.processarWebhook(
      { events: ["PV.REFUND_PIX"], data: { id: "tid-1" } },
      "Bearer token-rede",
    );
    expect(financeiro.findByAsaasPaymentId).not.toHaveBeenCalled();
  });

  it("marca a parcela como PAGO quando o tid é reconhecido", async () => {
    financeiro.findByAsaasPaymentId.mockResolvedValue(parcelaFake as never);
    legado.obterUsuarioSistema.mockResolvedValue("admin-1");

    await redeService.processarWebhook(
      { events: ["PV.UPDATE_TRANSACTION_PIX"], data: { id: "tid-1", txid: "x", endToEndId: "e2e" } },
      "Bearer token-rede",
    );

    expect(financeiroSvc.atualizar).toHaveBeenCalledWith(
      "parcela-1",
      expect.objectContaining({ status: "PAGO" }),
      "admin-1",
    );
  });

  it("ignora quando o tid não corresponde a nenhuma parcela", async () => {
    financeiro.findByAsaasPaymentId.mockResolvedValue(null);
    await redeService.processarWebhook(
      { events: ["PV.UPDATE_TRANSACTION_PIX"], data: { id: "tid-desconhecido" } },
      "Bearer token-rede",
    );
    expect(financeiroSvc.atualizar).not.toHaveBeenCalled();
  });
});
