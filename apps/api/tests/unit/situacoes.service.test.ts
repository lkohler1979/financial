import { beforeEach, describe, expect, it, vi } from "vitest";
import { situacoesService } from "../../src/modules/cobranca/situacoes.service";
import { situacoesRepository } from "../../src/modules/cobranca/situacoes.repository";
import { ConflictError, NotFoundError } from "../../src/shared/errors/app-error";

vi.mock("../../src/modules/cobranca/situacoes.repository", () => ({
  situacoesRepository: {
    findById: vi.fn(),
    findByNome: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    countMatriculas: vi.fn(),
  },
}));

const repo = vi.mocked(situacoesRepository);

const situacaoFake = { id: "situacao-1", nome: "Pendente" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("situacoesService.criar", () => {
  it("cria quando o nome não existe", async () => {
    repo.findByNome.mockResolvedValue(null);
    repo.create.mockResolvedValue(situacaoFake as never);

    const resultado = await situacoesService.criar({
      nome: "Pendente",
      cor: "#000",
      ordem: 0,
      ativa: true,
      participaNovosRelatorios: true,
    });

    expect(resultado).toBe(situacaoFake);
  });

  it("rejeita quando já existe situação com o mesmo nome", async () => {
    repo.findByNome.mockResolvedValue(situacaoFake as never);

    await expect(
      situacoesService.criar({
        nome: "Pendente",
        cor: "#000",
        ordem: 0,
        ativa: true,
        participaNovosRelatorios: true,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("situacoesService.buscarPorId", () => {
  it("lança NotFound quando não existe", async () => {
    repo.findById.mockResolvedValue(null);
    await expect(situacoesService.buscarPorId("x")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("situacoesService.remover", () => {
  it("bloqueia remoção quando há matrículas usando a situação", async () => {
    repo.findById.mockResolvedValue(situacaoFake as never);
    repo.countMatriculas.mockResolvedValue(3);

    await expect(situacoesService.remover("situacao-1")).rejects.toBeInstanceOf(ConflictError);
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it("remove quando não há matrículas usando a situação", async () => {
    repo.findById.mockResolvedValue(situacaoFake as never);
    repo.countMatriculas.mockResolvedValue(0);

    await situacoesService.remover("situacao-1");
    expect(repo.delete).toHaveBeenCalledWith("situacao-1");
  });
});
