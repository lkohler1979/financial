import { beforeEach, describe, expect, it, vi } from "vitest";
import { auditoriaQueryService } from "../../src/modules/auditoria/auditoria.query-service";
import { auditoriaRepository } from "../../src/modules/auditoria/auditoria.repository";

vi.mock("../../src/modules/auditoria/auditoria.repository", () => ({
  auditoriaRepository: {
    list: vi.fn(),
    listarEntidades: vi.fn(),
  },
}));

const repo = vi.mocked(auditoriaRepository);

beforeEach(() => {
  vi.clearAllMocks();
  repo.list.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 });
});

describe("auditoriaQueryService.listar", () => {
  it("normaliza o intervalo de datas para dia completo", async () => {
    await auditoriaQueryService.listar({
      dataInicio: new Date("2026-07-01T12:34:00"),
      dataFim: new Date("2026-07-03T01:02:03"),
      page: 1,
      pageSize: 20,
    });

    expect(repo.list).toHaveBeenCalledWith(
      expect.objectContaining({
        dataInicio: new Date("2026-07-01T00:00:00"),
        dataFim: new Date("2026-07-03T23:59:59.999"),
      }),
    );
  });
});

describe("auditoriaQueryService.listarEntidades", () => {
  it("delega a listagem de entidades ao repositório", async () => {
    repo.listarEntidades.mockResolvedValue(["Aluno", "Configuracao"]);

    await expect(auditoriaQueryService.listarEntidades()).resolves.toEqual([
      "Aluno",
      "Configuracao",
    ]);
  });
});
