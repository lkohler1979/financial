import { beforeEach, describe, expect, it, vi } from "vitest";
import { matriculasService } from "../../src/modules/matriculas/matriculas.service";
import { matriculasRepository } from "../../src/modules/matriculas/matriculas.repository";
import { sacadosService } from "../../src/modules/sacados/sacados.service";
import { ValidationError } from "../../src/shared/errors/app-error";

vi.mock("../../src/modules/matriculas/matriculas.repository", () => ({
  matriculasRepository: { findById: vi.fn(), update: vi.fn(), countCobrancasEmitidasEmAberto: vi.fn() },
}));
vi.mock("../../src/modules/sacados/sacados.service", () => ({
  sacadosService: { obterOuCriar: vi.fn(), buscarPorId: vi.fn() },
}));
vi.mock("../../src/modules/auditoria/auditoria.service", () => ({ registrarAuditoria: vi.fn() }));
vi.mock("../../src/modules/asaas/asaas.service", () => ({ asaasService: {} }));
vi.mock("../../src/modules/matriculas/situacao.service", () => ({ situacaoService: {} }));

const repo = vi.mocked(matriculasRepository);
const sacados = vi.mocked(sacadosService);

const base = { id: "m1", alunoId: "a1", cursoId: "c1", situacao: "ATIVA", _count: { parcelas: 3 } };

beforeEach(() => {
  vi.clearAllMocks();
  repo.update.mockResolvedValue({ ...base, sacado: null } as never);
  repo.countCobrancasEmitidasEmAberto.mockResolvedValue(0);
});

describe("matriculasService.alterarSacado", () => {
  it("troca para um sacado existente e avisa quantas cobranças continuam no nome do anterior", async () => {
    repo.findById.mockResolvedValue({ ...base, sacado: { id: "s-velho" } } as never);
    sacados.buscarPorId.mockResolvedValue({ id: "s-novo" } as never);
    repo.countCobrancasEmitidasEmAberto.mockResolvedValue(2);

    const r = await matriculasService.alterarSacado("m1", { sacadoId: "s-novo" }, "u");

    expect(repo.update).toHaveBeenCalledWith("m1", { sacado: { connect: { id: "s-novo" } } });
    expect(r.cobrancasEmitidasNoSacadoAnterior).toBe(2);
  });

  it("cria/reaproveita o sacado a partir dos dados informados", async () => {
    repo.findById.mockResolvedValue({ ...base, sacado: null } as never);
    sacados.obterOuCriar.mockResolvedValue({ id: "s-novo" } as never);
    await matriculasService.alterarSacado(
      "m1",
      { sacado: { tipoPessoa: "JURIDICA", cpfCnpj: "11222333000181", nome: "Empresa" } },
      "u",
    );
    expect(sacados.obterOuCriar).toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalledWith("m1", { sacado: { connect: { id: "s-novo" } } });
  });

  it("null volta a ser o próprio aluno (desconecta o sacado)", async () => {
    repo.findById.mockResolvedValue({ ...base, sacado: { id: "s1" } } as never);
    await matriculasService.alterarSacado("m1", { sacadoId: null }, "u");
    expect(repo.update).toHaveBeenCalledWith("m1", { sacado: { disconnect: true } });
  });

  it("recusa quando o responsável já é o mesmo", async () => {
    repo.findById.mockResolvedValue({ ...base, sacado: { id: "s1" } } as never);
    sacados.buscarPorId.mockResolvedValue({ id: "s1" } as never);
    await expect(matriculasService.alterarSacado("m1", { sacadoId: "s1" }, "u")).rejects.toBeInstanceOf(ValidationError);

    repo.findById.mockResolvedValue({ ...base, sacado: null } as never);
    await expect(matriculasService.alterarSacado("m1", { sacadoId: null }, "u")).rejects.toBeInstanceOf(ValidationError);
    expect(repo.update).not.toHaveBeenCalled();
  });
});
