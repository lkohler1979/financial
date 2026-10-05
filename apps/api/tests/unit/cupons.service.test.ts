import { beforeEach, describe, expect, it, vi } from "vitest";
import { aplicarDesconto, cuponsService } from "../../src/modules/cupons/cupons.service";
import { cuponsRepository } from "../../src/modules/cupons/cupons.repository";
import { ValidationError } from "../../src/shared/errors/app-error";

vi.mock("../../src/modules/cupons/cupons.repository", () => ({
  cuponsRepository: { findByCodigo: vi.fn(), findById: vi.fn(), list: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
vi.mock("../../src/modules/auditoria/auditoria.service", () => ({ registrarAuditoria: vi.fn() }));

const repo = vi.mocked(cuponsRepository);
beforeEach(() => vi.clearAllMocks());

describe("aplicarDesconto", () => {
  it("percentual sobre o valor", () => {
    expect(aplicarDesconto({ tipoDesconto: "PERCENTUAL", valor: 10 }, 3218.4)).toBe(2896.56);
  });

  it("valor fixo abatido do total", () => {
    expect(aplicarDesconto({ tipoDesconto: "VALOR", valor: 200 }, 1000)).toBe(800);
  });

  it("recusa desconto que zera a cobrança", () => {
    expect(() => aplicarDesconto({ tipoDesconto: "VALOR", valor: 1000 }, 1000)).toThrow(ValidationError);
    expect(() => aplicarDesconto({ tipoDesconto: "PERCENTUAL", valor: 100 }, 500)).toThrow(ValidationError);
  });
});

describe("cuponsService.obterValido", () => {
  it("recusa cupom não cadastrado", async () => {
    repo.findByCodigo.mockResolvedValue(null);
    await expect(cuponsService.obterValido("NAOEXISTE")).rejects.toBeInstanceOf(ValidationError);
  });

  it("recusa cupom inativo", async () => {
    repo.findByCodigo.mockResolvedValue({ ativo: false, validadeAte: null } as never);
    await expect(cuponsService.obterValido("X")).rejects.toBeInstanceOf(ValidationError);
  });

  it("recusa cupom vencido", async () => {
    repo.findByCodigo.mockResolvedValue({ ativo: true, validadeAte: new Date(2020, 0, 1) } as never);
    await expect(cuponsService.obterValido("X")).rejects.toBeInstanceOf(ValidationError);
  });

  it("aceita cupom ativo (busca em maiúsculas)", async () => {
    repo.findByCodigo.mockResolvedValue({ id: "c1", ativo: true, validadeAte: null } as never);
    await cuponsService.obterValido(" promo10 ");
    expect(repo.findByCodigo).toHaveBeenCalledWith("PROMO10");
  });
});
