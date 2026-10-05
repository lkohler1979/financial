import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  emissaoCobrancaService,
  emiteNaMatricula,
} from "../../src/modules/asaas/emissao-cobranca.service";
import { emissaoCobrancaRepository } from "../../src/modules/asaas/emissao-cobranca.repository";
import { asaasService } from "../../src/modules/asaas/asaas.service";
import { configuracoesRepository } from "../../src/modules/configuracoes/configuracoes.repository";

vi.mock("../../src/modules/asaas/asaas.service", () => ({ asaasService: { gerarCobrancaParcela: vi.fn() } }));
vi.mock("../../src/modules/asaas/emissao-cobranca.repository", () => ({
  emissaoCobrancaRepository: { listarTipos: vi.fn(), listarSemCobrancaVencendo: vi.fn() },
}));
vi.mock("../../src/modules/configuracoes/configuracoes.repository", () => ({
  configuracoesRepository: { obterOuCriar: vi.fn() },
}));

const gerar = vi.mocked(asaasService.gerarCobrancaParcela);
const repo = vi.mocked(emissaoCobrancaRepository);
const config = vi.mocked(configuracoesRepository);

beforeEach(() => vi.clearAllMocks());

describe("emiteNaMatricula", () => {
  it("TODAS / PRIMEIRA / SOB_DEMANDA", () => {
    expect([0, 1, 5].map((i) => emiteNaMatricula("TODAS", i))).toEqual([true, true, true]);
    expect([0, 1, 5].map((i) => emiteNaMatricula("PRIMEIRA", i))).toEqual([true, false, false]);
    expect([0, 1].map((i) => emiteNaMatricula("SOB_DEMANDA", i))).toEqual([false, false]);
  });
});

describe("emissaoCobrancaService.emitir", () => {
  it("usa a forma da parcela, senão a padrão, senão boleto; falha não derruba as demais", async () => {
    gerar.mockResolvedValueOnce({} as never).mockRejectedValueOnce(new Error("Asaas fora")).mockResolvedValueOnce({} as never);
    const r = await emissaoCobrancaService.emitir(
      [
        { id: "a", formaPagamento: "PIX" },
        { id: "b", formaPagamento: null },
        { id: "c", formaPagamento: null },
      ],
      null,
      "u1",
    );
    expect(gerar).toHaveBeenNthCalledWith(1, "a", "PIX", "u1");
    expect(gerar).toHaveBeenNthCalledWith(2, "b", "BOLETO", "u1");
    expect(r).toEqual({ emitidas: 2, falhas: [{ parcelaId: "b", erro: "Asaas fora" }] });
  });
});

describe("emissaoCobrancaService.executarEmissaoAntecipada", () => {
  const agora = new Date(2026, 9, 7, 6, 0);

  it("com 0 dias fica desligada", async () => {
    config.obterOuCriar.mockResolvedValue({ emissaoAntecipadaDias: 0 } as never);
    const r = await emissaoCobrancaService.executarEmissaoAntecipada(agora);
    expect(r.emitidas).toBe(0);
    expect(repo.listarSemCobrancaVencendo).not.toHaveBeenCalled();
  });

  it("emite só tipos que não são sob demanda; sem usuário na auditoria", async () => {
    config.obterOuCriar.mockResolvedValue({ emissaoAntecipadaDias: 10 } as never);
    repo.listarTipos.mockResolvedValue([
      { nome: "Mensalidade", emissaoNaMatricula: "PRIMEIRA", formaPagamentoPadrao: "BOLETO" },
      { nome: "Renegociação", emissaoNaMatricula: "SOB_DEMANDA", formaPagamentoPadrao: null },
    ] as never);
    repo.listarSemCobrancaVencendo.mockResolvedValue([
      { id: "m2", tipoTitulo: "Mensalidade", formaPagamento: null },
      { id: "r1", tipoTitulo: "Renegociação", formaPagamento: null },
      { id: "x1", tipoTitulo: "Tipo legado", formaPagamento: null },
    ] as never);
    gerar.mockResolvedValue({} as never);

    const r = await emissaoCobrancaService.executarEmissaoAntecipada(agora);

    expect(gerar).toHaveBeenCalledTimes(1);
    expect(gerar).toHaveBeenCalledWith("m2", "BOLETO", null);
    expect(r).toMatchObject({ dias: 10, emitidas: 1, falhas: [] });
    // janela: de hoje 00:00 até daqui a 10 dias 23:59:59
    const [de, ate] = repo.listarSemCobrancaVencendo.mock.calls[0];
    expect(de).toEqual(new Date(2026, 9, 7));
    expect(ate.getDate()).toBe(17);
  });
});
