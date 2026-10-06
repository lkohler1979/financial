import { beforeEach, describe, expect, it, vi } from "vitest";
import { redeService } from "../../src/modules/rede/rede.service";
import { financeiroRepository } from "../../src/modules/financeiro/financeiro.repository";
import { configuracoesRepository } from "../../src/modules/configuracoes/configuracoes.repository";
import { registrarAuditoria } from "../../src/modules/auditoria/auditoria.service";
import { AppError } from "../../src/shared/errors/app-error";

const estornarCartao = vi.fn();
const consultarEstornos = vi.fn();
vi.mock("../../src/modules/rede/rede-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/modules/rede/rede-client")>()),
  RedeClient: vi.fn().mockImplementation(() => ({ estornarCartao, consultarEstornos })),
}));
vi.mock("../../src/shared/utils/criptografia", () => ({ decifrar: (v: string) => `dec(${v})`, criptografar: (v: string) => v }));
vi.mock("../../src/modules/financeiro/financeiro.repository", () => ({
  financeiroRepository: { findById: vi.fn(), update: vi.fn(), listarComEstornoPendente: vi.fn() },
}));
vi.mock("../../src/modules/financeiro/financeiro.service", () => ({ financeiroService: {} }));
vi.mock("../../src/modules/configuracoes/configuracoes.repository", () => ({
  configuracoesRepository: { obterOuCriar: vi.fn() },
}));
vi.mock("../../src/modules/sincronizacao-legado/sincronizacao-legado.repository", () => ({
  sincronizacaoLegadoRepository: { obterUsuarioSistema: vi.fn().mockResolvedValue("sistema") },
}));
vi.mock("../../src/modules/auditoria/auditoria.service", () => ({ registrarAuditoria: vi.fn() }));

const fin = vi.mocked(financeiroRepository);
const config = vi.mocked(configuracoesRepository);
const auditoria = vi.mocked(registrarAuditoria);

const paga = {
  id: "p1",
  status: "PAGO",
  valor: "150.00",
  valorPago: "150.00",
  provedorPagamento: "REDE",
  asaasBillingType: "CREDIT_CARD",
  asaasPaymentId: "TID1",
  cartaoEstornoId: null,
};

describe("redeService.estornarCartao", () => {
  beforeEach(() => {
    estornarCartao.mockReset();
    consultarEstornos.mockReset();
    fin.update.mockReset();
    auditoria.mockReset();
    fin.findById.mockResolvedValue(paga as never);
    config.obterOuCriar.mockResolvedValue({ redePvCriptografado: "pv", redeChaveIntegracaoCriptografada: "k", redeAmbiente: "SANDBOX" } as never);
  });

  it("estorno imediato (359): reabre a parcela, limpa a baixa e audita com o motivo", async () => {
    estornarCartao.mockResolvedValue({ concluido: true, refundId: "r1" });
    const r = await redeService.estornarCartao("p1", "Pagamento em duplicidade", "admin");

    expect(estornarCartao).toHaveBeenCalledWith("TID1", 15000);
    expect(r.concluido).toBe(true);
    expect(fin.update).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ status: "EM_ABERTO", dataPagamento: null, valorPago: null, asaasPaymentId: null, cartaoFinal: null }),
    );
    expect(auditoria).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: "admin", detalhes: expect.objectContaining({ acao: "estorno_cartao_solicitado", motivo: "Pagamento em duplicidade", tid: "TID1" }) }),
    );
  });

  it("estorno em processamento (360): continua paga, só marca o estorno pendente", async () => {
    estornarCartao.mockResolvedValue({ concluido: false, refundId: "r2" });
    const r = await redeService.estornarCartao("p1", "Cobrança indevida", "admin");

    expect(r.concluido).toBe(false);
    expect(fin.update).toHaveBeenCalledTimes(1);
    expect(fin.update).toHaveBeenCalledWith("p1", expect.objectContaining({ cartaoEstornoId: "r2" }));
    expect(fin.update).not.toHaveBeenCalledWith("p1", expect.objectContaining({ status: "EM_ABERTO" }));
  });

  it("regras: só parcela paga no cartão da Rede; sem estorno em andamento", async () => {
    for (const parcela of [
      { ...paga, status: "EM_ABERTO" },
      { ...paga, provedorPagamento: "ASAAS" },
      { ...paga, asaasBillingType: "PIX" },
      { ...paga, cartaoEstornoId: "r9" },
    ]) {
      fin.findById.mockResolvedValue(parcela as never);
      await expect(redeService.estornarCartao("p1", "motivo teste", "admin")).rejects.toBeInstanceOf(AppError);
    }
    expect(estornarCartao).not.toHaveBeenCalled();
  });

  it("Rede recusou (ex.: prazo expirado): erro e a parcela não muda", async () => {
    estornarCartao.mockRejectedValue(new AppError("Estorno não realizado: prazo", 422, "REDE_ESTORNO_RECUSADO"));
    await expect(redeService.estornarCartao("p1", "motivo teste", "admin")).rejects.toMatchObject({ codigo: "REDE_ESTORNO_RECUSADO" });
    expect(fin.update).not.toHaveBeenCalled();
  });
});

describe("redeService.conferirEstorno", () => {
  beforeEach(() => {
    consultarEstornos.mockReset();
    fin.update.mockReset();
    fin.findById.mockResolvedValue({ ...paga, cartaoEstornoId: "r2" } as never);
    config.obterOuCriar.mockResolvedValue({ redePvCriptografado: "pv", redeChaveIntegracaoCriptografada: "k", redeAmbiente: "SANDBOX" } as never);
  });

  it("Done: reabre a parcela", async () => {
    consultarEstornos.mockResolvedValue([{ refundId: "r2", status: "Done", amount: 15000 }]);
    expect(await redeService.conferirEstorno("p1", "admin")).toBe("CONCLUIDO");
    expect(fin.update).toHaveBeenCalledWith("p1", expect.objectContaining({ status: "EM_ABERTO" }));
  });

  it("Denied: tira a marcação e a parcela continua paga", async () => {
    consultarEstornos.mockResolvedValue([{ refundId: "r2", status: "Denied", amount: 15000 }]);
    expect(await redeService.conferirEstorno("p1", "admin")).toBe("NEGADO");
    expect(fin.update).toHaveBeenCalledWith("p1", { cartaoEstornoId: null, cartaoEstornoEm: null });
  });

  it("Processing (ou ainda sem registro): nada muda", async () => {
    consultarEstornos.mockResolvedValue([{ refundId: "r2", status: "Processing", amount: 15000 }]);
    expect(await redeService.conferirEstorno("p1", "admin")).toBe("PROCESSANDO");
    consultarEstornos.mockResolvedValue([]);
    expect(await redeService.conferirEstorno("p1", "admin")).toBe("PROCESSANDO");
    expect(fin.update).not.toHaveBeenCalled();
  });

  it("job: confere todos os pendentes sem parar se um falhar", async () => {
    fin.listarComEstornoPendente.mockResolvedValue([{ id: "a" }, { id: "b" }] as never);
    fin.findById
      .mockResolvedValueOnce({ ...paga, id: "a", cartaoEstornoId: "r2" } as never)
      .mockRejectedValueOnce(new Error("falhou"));
    consultarEstornos.mockResolvedValue([{ refundId: "r2", status: "Done", amount: 15000 }]);
    const r = await redeService.conferirEstornosPendentes();
    expect(r).toEqual({ conferidos: 1, concluidos: 1, negados: 0 });
  });
});
