import { beforeEach, describe, expect, it, vi } from "vitest";
import { tagsService } from "../../src/modules/cobranca/tags.service";
import { tagsRepository } from "../../src/modules/cobranca/tags.repository";
import { ConflictError, NotFoundError } from "../../src/shared/errors/app-error";

vi.mock("../../src/modules/cobranca/tags.repository", () => ({
  tagsRepository: {
    findById: vi.fn(),
    findByNome: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    countMatriculas: vi.fn(),
  },
}));

const repo = vi.mocked(tagsRepository);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("tagsService.criar", () => {
  it("cria quando o nome não existe", async () => {
    repo.findByNome.mockResolvedValue(null);
    repo.create.mockResolvedValue({ id: "tag-1", nome: "WhatsApp" } as never);

    const resultado = await tagsService.criar({ nome: "WhatsApp" });
    expect(resultado).toMatchObject({ nome: "WhatsApp" });
  });

  it("rejeita duplicata", async () => {
    repo.findByNome.mockResolvedValue({ id: "tag-1", nome: "WhatsApp" } as never);
    await expect(tagsService.criar({ nome: "WhatsApp" })).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("tagsService.remover", () => {
  it("lança NotFound quando a tag não existe", async () => {
    repo.findById.mockResolvedValue(null);
    await expect(tagsService.remover("x")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("bloqueia remoção quando há matrículas usando a tag", async () => {
    repo.findById.mockResolvedValue({ id: "tag-1", nome: "WhatsApp" } as never);
    repo.countMatriculas.mockResolvedValue(2);

    await expect(tagsService.remover("tag-1")).rejects.toBeInstanceOf(ConflictError);
    expect(repo.delete).not.toHaveBeenCalled();
  });
});
