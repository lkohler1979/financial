import { beforeEach, describe, expect, it, vi } from "vitest";
import { dashboardService } from "../../src/modules/dashboard/dashboard.service";
import { dashboardRepository } from "../../src/modules/dashboard/dashboard.repository";

vi.mock("../../src/modules/dashboard/dashboard.repository", () => ({
  dashboardRepository: {
    geral: vi.fn(),
    cobranca: vi.fn(),
  },
}));

const repo = vi.mocked(dashboardRepository);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dashboardService", () => {
  it("retorna o dashboard geral calculado pelo repositório", async () => {
    repo.geral.mockResolvedValue({ indicadores: { totalAlunos: 10 } } as never);

    const resultado = await dashboardService.geral();

    expect(resultado).toMatchObject({ indicadores: { totalAlunos: 10 } });
    expect(repo.geral).toHaveBeenCalledTimes(1);
  });

  it("retorna o dashboard de cobrança calculado pelo repositório", async () => {
    repo.cobranca.mockResolvedValue({ indicadores: { inadimplentes: 2 } } as never);

    const resultado = await dashboardService.cobranca();

    expect(resultado).toMatchObject({ indicadores: { inadimplentes: 2 } });
    expect(repo.cobranca).toHaveBeenCalledTimes(1);
  });
});
