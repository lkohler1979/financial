import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_SECRET = "segredo-de-teste";

import { redeService } from "../../src/modules/rede/rede.service";
import { portalService, limparLimitesLogin } from "../../src/modules/portal/portal.service";
import { financeiroRepository } from "../../src/modules/financeiro/financeiro.repository";
import { financeiroService } from "../../src/modules/financeiro/financeiro.service";
import { configuracoesRepository } from "../../src/modules/configuracoes/configuracoes.repository";
import { portalRepository } from "../../src/modules/portal/portal.repository";
import { sincronizacaoLegadoRepository } from "../../src/modules/sincronizacao-legado/sincronizacao-legado.repository";
import { pagamentoCartaoSchema } from "../../src/modules/rede/rede.schema";
import { AppError, NotFoundError } from "../../src/shared/errors/app-error";

const criarCobrancaCartao = vi.fn();
vi.mock("../../src/modules/rede/rede-client", () => ({
  RedeClient: vi.fn().mockImplementation(() => ({ criarCobrancaCartao })),
  gerarReferenciaRede: () => "PREF1234",
}));
vi.mock("../../src/shared/utils/criptografia", () => ({ decifrar: (v: string) => `dec(${v})`, criptografar: (v: string) => v }));
vi.mock("../../src/modules/financeiro/financeiro.repository", () => ({
  financeiroRepository: { findById: vi.fn(), update: vi.fn() },
}));
vi.mock("../../src/modules/financeiro/financeiro.service", () => ({ financeiroService: { atualizar: vi.fn() } }));
vi.mock("../../src/modules/configuracoes/configuracoes.repository", () => ({
  configuracoesRepository: { obterOuCriar: vi.fn() },
}));
vi.mock("../../src/modules/sincronizacao-legado/sincronizacao-legado.repository", () => ({
  sincronizacaoLegadoRepository: { obterUsuarioSistema: vi.fn() },
}));
vi.mock("../../src/modules/portal/portal.repository", () => ({
  portalRepository: { findParcelaDoDono: vi.fn() },
}));
vi.mock("../../src/modules/asaas/asaas.service", () => ({ asaasService: {} }));
vi.mock("../../src/modules/documentos/documentos.service", () => ({ documentosService: {} }));
vi.mock("../../src/modules/solicitacoes/solicitacoes.service", () => ({ solicitacoesService: {} }));
vi.mock("../../src/modules/tipos-cobranca/tipos-cobranca.service", () => ({
  tiposCobrancaService: { formasPagamentoHabilitadas: vi.fn().mockResolvedValue(["BOLETO", "CREDIT_CARD"]) },
}));

const fin = vi.mocked(financeiroRepository);
const finSvc = vi.mocked(financeiroService);
const config = vi.mocked(configuracoesRepository);
const portalRepo = vi.mocked(portalRepository);
const sistema = vi.mocked(sincronizacaoLegadoRepository.obterUsuarioSistema);

const cartao = pagamentoCartaoSchema.parse({
  numero: "5448280000000007",
  nome: "Maria Silva",
  mes: 1,
  ano: 2035,
  cvv: "123",
  parcelas: 1,
});

const parcelaAberta = { id: "p1", status: "EM_ABERTO", valor: "123.45", asaasPaymentId: null };
const configRede = {
  provedorCartao: "REDE",
  redePvCriptografado: "pv",
  redeChaveIntegracaoCriptografada: "chave",
  redeAmbiente: "SANDBOX",
  redeCartaoMaxParcelas: 3,
};
const aprovado = {
  aprovado: true, returnCode: "00", returnMessage: "Success.", tid: "TID1", nsu: "1",
  authorizationCode: "A", bandeira: "Mastercard", bin: "544828", final: "0007",
};

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks não limpa implementações — evita que um mockRejectedValue vaze para o teste seguinte.
  fin.update.mockReset();
  criarCobrancaCartao.mockReset();
  limparLimitesLogin();
  fin.findById.mockResolvedValue(parcelaAberta as never);
  config.obterOuCriar.mockResolvedValue(configRede as never);
  sistema.mockResolvedValue("sistema-id");
});

describe("redeService.pagarComCartao", () => {
  it("aprovado: grava só TID/bandeira/final, dá baixa e não repassa dado de cartão", async () => {
    criarCobrancaCartao.mockResolvedValue(aprovado);
    const r = await redeService.pagarComCartao("p1", cartao);

    expect(criarCobrancaCartao).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 12345, installments: 1, cardNumber: "5448280000000007", securityCode: "123" }),
    );
    const gravado = JSON.stringify(fin.update.mock.calls);
    expect(gravado).toContain("TID1");
    expect(gravado).not.toContain("5448280000000007");
    expect(gravado).not.toContain("123\"");
    expect(fin.update).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ asaasBillingType: "CREDIT_CARD", provedorPagamento: "REDE", cartaoFinal: "0007", cartaoBandeira: "Mastercard" }),
    );
    expect(finSvc.atualizar).toHaveBeenCalledWith("p1", expect.objectContaining({ status: "PAGO", valorPago: 123.45 }), "sistema-id");
    expect(r).toMatchObject({ bandeira: "Mastercard", final: "0007", tid: "TID1" });
    // A Rede (v2) não devolve o nome da bandeira: ela é deduzida do prefixo do número.
  });

  it("bandeira vem do número quando a Rede não informa", async () => {
    criarCobrancaCartao.mockResolvedValue({ ...aprovado, bandeira: null });
    const r = await redeService.pagarComCartao("p1", { ...cartao, numero: "4235647728025682" });
    expect(r.bandeira).toBe("Visa");
    expect(fin.update).toHaveBeenCalledWith("p1", expect.objectContaining({ cartaoBandeira: "Visa" }));
    expect(JSON.stringify(r)).not.toContain("5448280000000007");
  });

  it("sem usuário do sistema ainda dá baixa direto no repositório", async () => {
    sistema.mockResolvedValue(null as never);
    criarCobrancaCartao.mockResolvedValue(aprovado);
    await redeService.pagarComCartao("p1", cartao);
    expect(finSvc.atualizar).not.toHaveBeenCalled();
    expect(fin.update).toHaveBeenLastCalledWith("p1", expect.objectContaining({ status: "PAGO" }));
  });

  it("recusa do emissor: erro 422, nada gravado, parcela continua em aberto", async () => {
    criarCobrancaCartao.mockResolvedValue({ ...aprovado, aprovado: false, returnCode: "101", returnMessage: "Unauthorized", tid: "T9" });
    await expect(redeService.pagarComCartao("p1", cartao)).rejects.toMatchObject({ statusCode: 422, codigo: "CARTAO_RECUSADO" });
    expect(fin.update).not.toHaveBeenCalled();
    expect(finSvc.atualizar).not.toHaveBeenCalled();
  });

  it("aprovou mas falhou ao gravar: erro com o TID, sem dado do cartão", async () => {
    criarCobrancaCartao.mockResolvedValue(aprovado);
    fin.update.mockRejectedValue(new Error("db fora"));
    const erro = await redeService.pagarComCartao("p1", cartao).catch((e) => e);
    expect(erro).toMatchObject({ codigo: "CARTAO_APROVADO_SEM_BAIXA" });
    expect(erro.message).toContain("TID1");
    expect(erro.message).not.toContain("5448");
  });

  it("regras: parcela paga, cobrança já emitida, provedor não Rede, parcelas acima do máximo", async () => {
    fin.findById.mockResolvedValue({ ...parcelaAberta, status: "PAGO" } as never);
    await expect(redeService.pagarComCartao("p1", cartao)).rejects.toBeInstanceOf(AppError);

    fin.findById.mockResolvedValue({ ...parcelaAberta, asaasPaymentId: "pay_1" } as never);
    await expect(redeService.pagarComCartao("p1", cartao)).rejects.toThrow(/já tem uma cobrança/);

    fin.findById.mockResolvedValue(parcelaAberta as never);
    config.obterOuCriar.mockResolvedValue({ ...configRede, provedorCartao: "ASAAS" } as never);
    await expect(redeService.pagarComCartao("p1", cartao)).rejects.toThrow(/não está habilitado/);

    config.obterOuCriar.mockResolvedValue(configRede as never);
    await expect(redeService.pagarComCartao("p1", { ...cartao, parcelas: 4 })).rejects.toThrow(/até 3x/);
    expect(criarCobrancaCartao).not.toHaveBeenCalled();
  });

  it("à vista obrigatório quando o máximo configurado é 1", async () => {
    config.obterOuCriar.mockResolvedValue({ ...configRede, redeCartaoMaxParcelas: 1 } as never);
    await expect(redeService.pagarComCartao("p1", { ...cartao, parcelas: 2 })).rejects.toThrow(/somente à vista/);
  });
});

describe("portalService.pagarComCartao", () => {
  const sessao = { alunoId: "a1" };

  it("parcela de outro aluno: 404 e nada é enviado à Rede", async () => {
    portalRepo.findParcelaDoDono.mockResolvedValue(null);
    await expect(portalService.pagarComCartao(sessao, "p-de-outro", cartao, "ip")).rejects.toBeInstanceOf(NotFoundError);
    expect(criarCobrancaCartao).not.toHaveBeenCalled();
  });

  it("bloqueia a parcela após 5 recusas seguidas (anti-robô), mesmo com cartão bom", async () => {
    portalRepo.findParcelaDoDono.mockResolvedValue({ id: "p1" } as never);
    criarCobrancaCartao.mockResolvedValue({ ...aprovado, aprovado: false, returnCode: "101", returnMessage: "x" });
    for (let i = 0; i < 5; i++) {
      await expect(portalService.pagarComCartao(sessao, "p1", cartao, "ip")).rejects.toMatchObject({ codigo: "CARTAO_RECUSADO" });
    }
    criarCobrancaCartao.mockClear();
    criarCobrancaCartao.mockResolvedValue(aprovado);
    await expect(portalService.pagarComCartao(sessao, "p1", cartao, "ip")).rejects.toMatchObject({ statusCode: 429 });
    expect(criarCobrancaCartao).not.toHaveBeenCalled();
  });

  it("pagamento aprovado devolve só bandeira/final e zera o contador da parcela", async () => {
    portalRepo.findParcelaDoDono.mockResolvedValue({ id: "p1" } as never);
    criarCobrancaCartao.mockResolvedValueOnce({ ...aprovado, aprovado: false, returnCode: "101", returnMessage: "x" });
    await expect(portalService.pagarComCartao(sessao, "p1", cartao, "ip")).rejects.toBeInstanceOf(AppError);
    criarCobrancaCartao.mockResolvedValueOnce(aprovado);
    const r = await portalService.pagarComCartao(sessao, "p1", cartao, "ip");
    expect(r).toMatchObject({ final: "0007" });
  });
});
