import { beforeEach, describe, expect, it, vi } from "vitest";
import { situacaoService } from "../../src/modules/matriculas/situacao.service";
import { situacaoRepository } from "../../src/modules/matriculas/situacao.repository";
import { NotFoundError, ValidationError } from "../../src/shared/errors/app-error";

vi.mock("../../src/modules/matriculas/situacao.repository", () => ({
  situacaoRepository: {
    findMatricula: vi.fn(),
    trocar: vi.fn(),
    registrarInicial: vi.fn(),
    listarHistorico: vi.fn(),
  },
}));
vi.mock("../../src/modules/auditoria/auditoria.service", () => ({ registrarAuditoria: vi.fn() }));

const repo = vi.mocked(situacaoRepository);
beforeEach(() => vi.clearAllMocks());

describe("situacaoService.alterar", () => {
  it("matrícula inexistente", async () => {
    repo.findMatricula.mockResolvedValue(null);
    await expect(situacaoService.alterar("m", { situacao: "ATIVA" }, "u")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("recusa situação inválida e a mesma situação", async () => {
    repo.findMatricula.mockResolvedValue({ id: "m", situacao: "ATIVA" } as never);
    await expect(situacaoService.alterar("m", { situacao: "XPTO" }, "u")).rejects.toBeInstanceOf(ValidationError);
    await expect(situacaoService.alterar("m", { situacao: "ATIVA" }, "u")).rejects.toBeInstanceOf(ValidationError);
  });

  it("trancar/cancelar exige motivo", async () => {
    repo.findMatricula.mockResolvedValue({ id: "m", situacao: "ATIVA" } as never);
    await expect(situacaoService.alterar("m", { situacao: "TRANCADA" }, "u")).rejects.toBeInstanceOf(ValidationError);
    await expect(situacaoService.alterar("m", { situacao: "CANCELADA", motivo: "  " }, "u")).rejects.toBeInstanceOf(ValidationError);
    expect(repo.trocar).not.toHaveBeenCalled();
  });

  it("troca e grava histórico com anterior, motivo, período e usuário", async () => {
    repo.findMatricula.mockResolvedValue({ id: "m", situacao: "ATIVA" } as never);
    await situacaoService.alterar(
      "m",
      { situacao: "TRANCADA", motivo: "Questões financeiras", periodoLetivo: "2026/2", observacoes: "Volta em 2027" },
      "u1",
    );
    expect(repo.trocar).toHaveBeenCalledWith("m", {
      situacaoAnterior: "ATIVA",
      situacaoNova: "TRANCADA",
      periodoLetivo: "2026/2",
      motivo: "Questões financeiras",
      observacoes: "Volta em 2027",
      usuarioId: "u1",
    });
  });
});

describe("situacaoService.ativarPorPagamento", () => {
  it("ativa só quem aguarda pagamento, como mudança do sistema", async () => {
    repo.findMatricula.mockResolvedValue({ id: "m", situacao: "AGUARDANDO_PAGAMENTO" } as never);
    expect(await situacaoService.ativarPorPagamento("m")).toBe(true);
    expect(repo.trocar).toHaveBeenCalledWith("m", expect.objectContaining({ situacaoNova: "ATIVA", usuarioId: null }));
  });

  it("não reativa matrícula trancada/cancelada", async () => {
    repo.findMatricula.mockResolvedValue({ id: "m", situacao: "TRANCADA" } as never);
    expect(await situacaoService.ativarPorPagamento("m")).toBe(false);
    expect(repo.trocar).not.toHaveBeenCalled();
  });

  it("falha interna não propaga (não pode impedir o registro do pagamento)", async () => {
    repo.findMatricula.mockRejectedValue(new Error("db"));
    expect(await situacaoService.ativarPorPagamento("m")).toBe(false);
  });
});
