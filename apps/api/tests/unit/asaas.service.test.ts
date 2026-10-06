import { beforeEach, describe, expect, it, vi } from "vitest";
import { asaasService } from "../../src/modules/asaas/asaas.service";
import { configuracoesRepository } from "../../src/modules/configuracoes/configuracoes.repository";
import { alunosRepository } from "../../src/modules/alunos/alunos.repository";
import { financeiroRepository } from "../../src/modules/financeiro/financeiro.repository";
import { financeiroService } from "../../src/modules/financeiro/financeiro.service";
import { sincronizacaoLegadoRepository } from "../../src/modules/sincronizacao-legado/sincronizacao-legado.repository";
import { registrarAuditoria } from "../../src/modules/auditoria/auditoria.service";
import { AsaasClient } from "../../src/modules/asaas/asaas-client";
import { AppError, NotFoundError } from "../../src/shared/errors/app-error";

const { criarClienteMock, criarCobrancaMock, obterLinhaDigitavelMock, obterQrCodePixMock } = vi.hoisted(
  () => ({
    criarClienteMock: vi.fn(),
    criarCobrancaMock: vi.fn(),
    obterLinhaDigitavelMock: vi.fn(),
    obterQrCodePixMock: vi.fn(),
  }),
);

const { criarCobrancaPixRedeMock } = vi.hoisted(() => ({
  criarCobrancaPixRedeMock: vi.fn(),
}));

vi.mock("../../src/modules/asaas/asaas-client", () => ({
  AsaasClient: vi.fn().mockImplementation(() => ({
    criarCliente: criarClienteMock,
    criarCobranca: criarCobrancaMock,
    obterLinhaDigitavel: obterLinhaDigitavelMock,
    obterQrCodePix: obterQrCodePixMock,
  })),
}));

vi.mock("../../src/modules/rede/rede-client", () => ({
  RedeClient: vi.fn().mockImplementation(() => ({
    criarCobrancaPix: criarCobrancaPixRedeMock,
  })),
}));

vi.mock("../../src/modules/configuracoes/configuracoes.repository", () => ({
  configuracoesRepository: { obterOuCriar: vi.fn() },
}));
vi.mock("../../src/modules/alunos/alunos.repository", () => ({
  alunosRepository: { findById: vi.fn(), update: vi.fn() },
}));
vi.mock("../../src/modules/financeiro/financeiro.repository", () => ({
  financeiroRepository: { findById: vi.fn(), update: vi.fn(), findByAsaasPaymentId: vi.fn() },
}));
vi.mock("../../src/modules/financeiro/financeiro.service", () => ({
  financeiroService: { atualizar: vi.fn() },
}));
vi.mock("../../src/modules/sincronizacao-legado/sincronizacao-legado.repository", () => ({
  sincronizacaoLegadoRepository: { obterUsuarioSistema: vi.fn() },
}));
vi.mock("../../src/modules/auditoria/auditoria.service", () => ({
  registrarAuditoria: vi.fn(),
}));
vi.mock("../../src/shared/utils/criptografia", () => ({
  criptografar: vi.fn((v: string) => `cripto(${v})`),
  decifrar: vi.fn((v: string) => v.replace(/^cripto\(/, "").replace(/\)$/, "")),
}));

const configRepo = vi.mocked(configuracoesRepository);
const alunos = vi.mocked(alunosRepository);
const financeiro = vi.mocked(financeiroRepository);
const financeiroSvc = vi.mocked(financeiroService);
const legado = vi.mocked(sincronizacaoLegadoRepository);
const auditoria = vi.mocked(registrarAuditoria);

const USUARIO = "usuario-1";
const CONFIG_COM_ASAAS = {
  asaasAmbiente: "SANDBOX" as const,
  asaasApiKeyCriptografada: "cripto(chave-sandbox)",
  asaasWebhookTokenCriptografado: "cripto(token-webhook)",
  provedorBoleto: "ASAAS" as const,
  provedorPix: "ASAAS" as const,
  provedorCartao: "ASAAS" as const,
};

const alunoFake = {
  id: "aluno-1",
  nome: "Fulano de Tal",
  cpf: "12345678900",
  email: "fulano@exemplo.com",
  telefone1: "11999999999",
  asaasCustomerId: null as string | null,
};

const parcelaFake = {
  id: "parcela-1",
  valor: 100,
  vencimento: new Date(2026, 9, 10),
  parcela: "1/12",
  asaasPaymentId: null as string | null,
  asaasBillingType: null as string | null,
  asaasBoletoUrl: null as string | null,
  asaasLinhaDigitavel: null as string | null,
  asaasInvoiceUrl: null as string | null,
  asaasPixQrCodeImagem: null as string | null,
  asaasPixCopiaECola: null as string | null,
  asaasPixQrCodeExpiracao: null as Date | null,
  matricula: {
    aluno: { id: "aluno-1" },
    curso: { nome: "Curso Teste" },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  configRepo.obterOuCriar.mockResolvedValue(CONFIG_COM_ASAAS as never);
});

describe("asaasService.obterOuCriarClienteAluno", () => {
  it("reaproveita o asaasCustomerId já cacheado, sem chamar a API", async () => {
    alunos.findById.mockResolvedValue({ ...alunoFake, asaasCustomerId: "cus_existente" } as never);

    const resultado = await asaasService.obterOuCriarClienteAluno("aluno-1");

    expect(resultado).toBe("cus_existente");
    expect(criarClienteMock).not.toHaveBeenCalled();
    expect(alunos.update).not.toHaveBeenCalled();
  });

  it("cria um cliente novo no Asaas e cacheia o id quando ainda não existe", async () => {
    alunos.findById.mockResolvedValue(alunoFake as never);
    criarClienteMock.mockResolvedValue({ id: "cus_novo" });

    const resultado = await asaasService.obterOuCriarClienteAluno("aluno-1");

    expect(resultado).toBe("cus_novo");
    expect(criarClienteMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: alunoFake.nome, cpfCnpj: alunoFake.cpf }),
    );
    expect(alunos.update).toHaveBeenCalledWith("aluno-1", { asaasCustomerId: "cus_novo" });
  });

  it("rejeita quando o aluno não existe", async () => {
    alunos.findById.mockResolvedValue(null);
    await expect(asaasService.obterOuCriarClienteAluno("inexistente")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("asaasService.gerarCobrancaParcela", () => {
  it("é idempotente: devolve a cobrança já existente sem chamar a API de novo", async () => {
    financeiro.findById.mockResolvedValue({
      ...parcelaFake,
      asaasPaymentId: "pay_existente",
      asaasBillingType: "BOLETO",
      asaasBoletoUrl: "https://asaas/boleto/pay_existente",
      asaasLinhaDigitavel: "00190.00009...",
    } as never);

    const resultado = await asaasService.gerarCobrancaParcela("parcela-1", "BOLETO", USUARIO);

    expect(resultado.asaasPaymentId).toBe("pay_existente");
    expect(criarCobrancaMock).not.toHaveBeenCalled();
  });

  it("recusa gerar cobrança de um tipo desabilitado em Configurações", async () => {
    financeiro.findById.mockResolvedValue(parcelaFake as never);
    configRepo.obterOuCriar.mockResolvedValue({
      ...CONFIG_COM_ASAAS,
      provedorPix: null,
    } as never);

    await expect(asaasService.gerarCobrancaParcela("parcela-1", "PIX", USUARIO)).rejects.toThrow(
      "Esta forma de pagamento não está habilitada",
    );
    expect(criarCobrancaMock).not.toHaveBeenCalled();
  });

  it("gera um Pix via Rede quando provedorPix = REDE (não chama o Asaas)", async () => {
    financeiro.findById.mockResolvedValue(parcelaFake as never);
    configRepo.obterOuCriar.mockResolvedValue({
      ...CONFIG_COM_ASAAS,
      provedorPix: "REDE",
      redePvCriptografado: "cripto(pv-teste)",
      redeChaveIntegracaoCriptografada: "cripto(chave-rede-teste)",
      redeAmbiente: "SANDBOX",
    } as never);
    criarCobrancaPixRedeMock.mockResolvedValue({
      tid: "tid_rede_123",
      qrCodeImagem: "base64...",
      qrCodeCopiaECola: "00020101...",
      dataExpiracao: "2026-10-20T10:00:00",
    });
    financeiro.update.mockResolvedValue({
      ...parcelaFake,
      asaasPaymentId: "tid_rede_123",
      asaasBillingType: "PIX",
      provedorPagamento: "REDE",
      asaasPixQrCodeImagem: "base64...",
      asaasPixCopiaECola: "00020101...",
    } as never);

    const resultado = await asaasService.gerarCobrancaParcela("parcela-1", "PIX", USUARIO);

    expect(criarCobrancaMock).not.toHaveBeenCalled();
    expect(criarClienteMock).not.toHaveBeenCalled();
    expect(criarCobrancaPixRedeMock).toHaveBeenCalledWith(
      expect.objectContaining({ reference: "parcela-1", amount: 10000 }),
    );
    expect(financeiro.update).toHaveBeenCalledWith(
      "parcela-1",
      expect.objectContaining({
        asaasPaymentId: "tid_rede_123",
        asaasBillingType: "PIX",
        provedorPagamento: "REDE",
      }),
    );
    expect(resultado.provedorPagamento).toBe("REDE");
  });

  it("recusa Cartão/Boleto via Rede (só Pix é suportado)", async () => {
    financeiro.findById.mockResolvedValue(parcelaFake as never);
    configRepo.obterOuCriar.mockResolvedValue({
      ...CONFIG_COM_ASAAS,
      provedorBoleto: "REDE",
    } as never);

    await expect(asaasService.gerarCobrancaParcela("parcela-1", "BOLETO", USUARIO)).rejects.toThrow(
      "A Rede suporta apenas Pix e cartão",
    );
  });

  it("envia fine/interest/discount quando configurados em Configurações", async () => {
    financeiro.findById.mockResolvedValue(parcelaFake as never);
    alunos.findById.mockResolvedValue({ ...alunoFake, asaasCustomerId: "cus_1" } as never);
    configRepo.obterOuCriar.mockResolvedValue({
      ...CONFIG_COM_ASAAS,
      asaasMultaPercentual: 2,
      asaasJurosMensalPercentual: 1,
      asaasDescontoPercentual: 10,
      asaasDescontoDiasAntesVencimento: 5,
    } as never);
    criarCobrancaMock.mockResolvedValue({
      id: "pay_novo",
      status: "PENDING",
      bankSlipUrl: "https://asaas/boleto/pay_novo",
      invoiceUrl: "https://asaas/fatura/pay_novo",
    });
    obterLinhaDigitavelMock.mockResolvedValue({ identificationField: "00190.00009...", barCode: "x" });
    financeiro.update.mockResolvedValue(parcelaFake as never);

    await asaasService.gerarCobrancaParcela("parcela-1", "BOLETO", USUARIO);

    expect(criarCobrancaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fine: { value: 2, type: "PERCENTAGE" },
        interest: { value: 1 },
        discount: { value: 10, type: "PERCENTAGE", dueDateLimitDays: 5 },
      }),
    );
  });

  it("não envia fine/interest/discount quando não configurados (evita sobrescrever a conta)", async () => {
    financeiro.findById.mockResolvedValue(parcelaFake as never);
    alunos.findById.mockResolvedValue({ ...alunoFake, asaasCustomerId: "cus_1" } as never);
    criarCobrancaMock.mockResolvedValue({
      id: "pay_novo",
      status: "PENDING",
      bankSlipUrl: null,
      invoiceUrl: "https://asaas/fatura/pay_novo",
    });
    obterLinhaDigitavelMock.mockResolvedValue({ identificationField: "x", barCode: "x" });
    financeiro.update.mockResolvedValue(parcelaFake as never);

    await asaasService.gerarCobrancaParcela("parcela-1", "BOLETO", USUARIO);

    const payloadEnviado = criarCobrancaMock.mock.calls[0][0];
    expect(payloadEnviado).not.toHaveProperty("fine");
    expect(payloadEnviado).not.toHaveProperty("interest");
    expect(payloadEnviado).not.toHaveProperty("discount");
  });

  it("gera um BOLETO: cria a cobrança, busca a linha digitável e audita", async () => {
    financeiro.findById.mockResolvedValue(parcelaFake as never);
    alunos.findById.mockResolvedValue({ ...alunoFake, asaasCustomerId: "cus_1" } as never);
    criarCobrancaMock.mockResolvedValue({
      id: "pay_novo",
      status: "PENDING",
      bankSlipUrl: "https://asaas/boleto/pay_novo",
      invoiceUrl: "https://asaas/fatura/pay_novo",
    });
    obterLinhaDigitavelMock.mockResolvedValue({ identificationField: "00190.00009...", barCode: "x" });
    financeiro.update.mockResolvedValue({
      ...parcelaFake,
      asaasPaymentId: "pay_novo",
      asaasBillingType: "BOLETO",
      asaasBoletoUrl: "https://asaas/boleto/pay_novo",
      asaasLinhaDigitavel: "00190.00009...",
    } as never);

    const resultado = await asaasService.gerarCobrancaParcela("parcela-1", "BOLETO", USUARIO);

    expect(criarCobrancaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_1",
        billingType: "BOLETO",
        value: 100,
        dueDate: "2026-10-10",
      }),
    );
    expect(obterQrCodePixMock).not.toHaveBeenCalled();
    expect(financeiro.update).toHaveBeenCalledWith(
      "parcela-1",
      expect.objectContaining({ asaasPaymentId: "pay_novo", asaasBoletoUrl: expect.any(String) }),
    );
    expect(resultado.asaasPaymentId).toBe("pay_novo");
    expect(auditoria).toHaveBeenCalledWith(
      expect.objectContaining({ entidade: "Parcela", acao: "ATUALIZACAO" }),
    );
  });

  it("gera um PIX: cria a cobrança e busca o QR Code (não a linha digitável)", async () => {
    financeiro.findById.mockResolvedValue(parcelaFake as never);
    alunos.findById.mockResolvedValue({ ...alunoFake, asaasCustomerId: "cus_1" } as never);
    criarCobrancaMock.mockResolvedValue({
      id: "pay_pix",
      status: "PENDING",
      bankSlipUrl: null,
      invoiceUrl: "https://asaas/fatura/pay_pix",
    });
    obterQrCodePixMock.mockResolvedValue({
      encodedImage: "base64...",
      payload: "00020126...copia-e-cola",
      expirationDate: "2026-10-11T00:00:00Z",
    });
    financeiro.update.mockResolvedValue({
      ...parcelaFake,
      asaasPaymentId: "pay_pix",
      asaasBillingType: "PIX",
      asaasPixCopiaECola: "00020126...copia-e-cola",
    } as never);

    const resultado = await asaasService.gerarCobrancaParcela("parcela-1", "PIX", USUARIO);

    expect(criarCobrancaMock).toHaveBeenCalledWith(expect.objectContaining({ billingType: "PIX" }));
    expect(obterLinhaDigitavelMock).not.toHaveBeenCalled();
    expect(financeiro.update).toHaveBeenCalledWith(
      "parcela-1",
      expect.objectContaining({
        asaasPixQrCodeImagem: "base64...",
        asaasPixCopiaECola: "00020126...copia-e-cola",
      }),
    );
    expect(resultado.asaasPaymentId).toBe("pay_pix");
  });

  it("gera CREDIT_CARD sem enviar dado de cartão nenhum — só cria a cobrança", async () => {
    financeiro.findById.mockResolvedValue(parcelaFake as never);
    alunos.findById.mockResolvedValue({ ...alunoFake, asaasCustomerId: "cus_1" } as never);
    criarCobrancaMock.mockResolvedValue({
      id: "pay_cartao",
      status: "PENDING",
      bankSlipUrl: null,
      invoiceUrl: "https://asaas/fatura/pay_cartao",
    });
    financeiro.update.mockResolvedValue({
      ...parcelaFake,
      asaasPaymentId: "pay_cartao",
      asaasBillingType: "CREDIT_CARD",
      asaasInvoiceUrl: "https://asaas/fatura/pay_cartao",
    } as never);

    const resultado = await asaasService.gerarCobrancaParcela("parcela-1", "CREDIT_CARD", USUARIO);

    const payloadEnviado = criarCobrancaMock.mock.calls[0][0];
    expect(payloadEnviado).not.toHaveProperty("creditCard");
    expect(payloadEnviado).not.toHaveProperty("creditCardHolderInfo");
    expect(obterLinhaDigitavelMock).not.toHaveBeenCalled();
    expect(obterQrCodePixMock).not.toHaveBeenCalled();
    expect(resultado.asaasInvoiceUrl).toBe("https://asaas/fatura/pay_cartao");
  });

  it("rejeita quando a parcela não existe", async () => {
    financeiro.findById.mockResolvedValue(null);
    await expect(
      asaasService.gerarCobrancaParcela("inexistente", "BOLETO", USUARIO),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("asaasService.processarWebhook", () => {
  const payloadConfirmado = {
    event: "PAYMENT_CONFIRMED",
    payment: { id: "pay_novo", value: 100, paymentDate: "2026-10-05" },
  };

  it("rejeita quando o token do webhook não está configurado", async () => {
    configRepo.obterOuCriar.mockResolvedValue({
      ...CONFIG_COM_ASAAS,
      asaasWebhookTokenCriptografado: null,
    } as never);

    await expect(
      asaasService.processarWebhook(payloadConfirmado, "token-webhook"),
    ).rejects.toBeInstanceOf(AppError);
    expect(financeiroSvc.atualizar).not.toHaveBeenCalled();
  });

  it("rejeita quando o token recebido não bate com o configurado", async () => {
    await expect(
      asaasService.processarWebhook(payloadConfirmado, "token-errado"),
    ).rejects.toBeInstanceOf(AppError);
    expect(financeiroSvc.atualizar).not.toHaveBeenCalled();
  });

  it("ignora eventos que não são de pagamento confirmado", async () => {
    await asaasService.processarWebhook(
      { event: "PAYMENT_OVERDUE", payment: { id: "pay_novo" } },
      "token-webhook",
    );
    expect(financeiroSvc.atualizar).not.toHaveBeenCalled();
  });

  it("ignora quando nenhuma Parcela corresponde ao asaasPaymentId", async () => {
    financeiro.findByAsaasPaymentId.mockResolvedValue(null);
    await asaasService.processarWebhook(payloadConfirmado, "token-webhook");
    expect(financeiroSvc.atualizar).not.toHaveBeenCalled();
  });

  it("marca a Parcela como PAGO quando o pagamento é confirmado", async () => {
    financeiro.findByAsaasPaymentId.mockResolvedValue({ ...parcelaFake, asaasPaymentId: "pay_novo" } as never);
    legado.obterUsuarioSistema.mockResolvedValue("admin-1");

    await asaasService.processarWebhook(payloadConfirmado, "token-webhook");

    expect(financeiroSvc.atualizar).toHaveBeenCalledWith(
      "parcela-1",
      expect.objectContaining({ status: "PAGO", valorPago: 100 }),
      "admin-1",
    );
  });

  it("não falha (só não registra) quando não há nenhum usuário administrador cadastrado", async () => {
    financeiro.findByAsaasPaymentId.mockResolvedValue({ ...parcelaFake, asaasPaymentId: "pay_novo" } as never);
    legado.obterUsuarioSistema.mockResolvedValue(null);

    await expect(
      asaasService.processarWebhook(payloadConfirmado, "token-webhook"),
    ).resolves.toBeUndefined();
    expect(financeiroSvc.atualizar).not.toHaveBeenCalled();
  });
});

describe("asaasService.gerarCobrancaParcela — cartão pela Rede", () => {
  it("não gera link: o pagador usa o formulário de cartão (código próprio para a emissão automática ignorar)", async () => {
    financeiro.findById.mockResolvedValue(parcelaFake as never);
    configRepo.obterOuCriar.mockResolvedValue({ ...CONFIG_COM_ASAAS, provedorCartao: "REDE" } as never);

    await expect(
      asaasService.gerarCobrancaParcela("parcela-1", "CREDIT_CARD", USUARIO),
    ).rejects.toMatchObject({ codigo: "CARTAO_REDE_SEM_LINK", statusCode: 422 });
  });
});
