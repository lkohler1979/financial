import { beforeEach, describe, expect, it, vi } from "vitest";
import { financeiroService } from "../../src/modules/financeiro/financeiro.service";
import { financeiroRepository } from "../../src/modules/financeiro/financeiro.repository";
import { matriculasRepository } from "../../src/modules/matriculas/matriculas.repository";
import { registrarAuditoria } from "../../src/modules/auditoria/auditoria.service";
import { ConflictError, NotFoundError } from "../../src/shared/errors/app-error";

vi.mock("../../src/modules/financeiro/financeiro.repository", () => ({
  financeiroRepository: {
    findById: vi.fn(),
    findByChaveNatural: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../../src/modules/matriculas/matriculas.repository", () => ({
  matriculasRepository: {
    findById: vi.fn(),
  },
}));

vi.mock("../../src/modules/auditoria/auditoria.service", () => ({
  registrarAuditoria: vi.fn(),
}));

const repo = vi.mocked(financeiroRepository);
const matriculas = vi.mocked(matriculasRepository);
const auditoria = vi.mocked(registrarAuditoria);

const matriculaFake = { id: "matricula-1" };
const parcelaFake = {
  id: "parcela-1",
  matriculaId: "matricula-1",
  codTitulo: "TIT-1",
  status: "EM_ABERTO",
  valor: 100,
  valorPago: null,
  dataPagamento: null,
};

const USUARIO = "usuario-1";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("financeiroService.criar", () => {
  it("cria a parcela quando a matrícula existe e o código do título é inédito", async () => {
    matriculas.findById.mockResolvedValue(matriculaFake as never);
    repo.findByChaveNatural.mockResolvedValue(null);
    repo.create.mockResolvedValue(parcelaFake as never);

    const resultado = await financeiroService.criar(
      {
        matriculaId: "matricula-1",
        codTitulo: "TIT-1",
        parcela: "1/3",
        vencimento: new Date("2026-08-10"),
        valor: 100,
      },
      USUARIO,
    );

    expect(resultado).toBe(parcelaFake);
    expect(auditoria).toHaveBeenCalledWith(
      expect.objectContaining({ entidade: "Parcela", acao: "CRIACAO" }),
    );
  });

  it("rejeita quando a matrícula não existe", async () => {
    matriculas.findById.mockResolvedValue(null);

    await expect(
      financeiroService.criar(
        {
          matriculaId: "matricula-x",
          codTitulo: "TIT-1",
          parcela: "1/3",
          vencimento: new Date(),
          valor: 100,
        },
        USUARIO,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("rejeita quando já existe parcela com o mesmo código de título na matrícula", async () => {
    matriculas.findById.mockResolvedValue(matriculaFake as never);
    repo.findByChaveNatural.mockResolvedValue(parcelaFake as never);

    await expect(
      financeiroService.criar(
        {
          matriculaId: "matricula-1",
          codTitulo: "TIT-1",
          parcela: "1/3",
          vencimento: new Date(),
          valor: 100,
        },
        USUARIO,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(repo.create).not.toHaveBeenCalled();
  });
});

describe("financeiroService.atualizar", () => {
  it("preenche dataPagamento/valorPago com padrão ao marcar como PAGO sem informá-los", async () => {
    repo.findById.mockResolvedValue(parcelaFake as never);
    repo.update.mockResolvedValue({ ...parcelaFake, status: "PAGO" } as never);

    await financeiroService.atualizar("parcela-1", { status: "PAGO" }, USUARIO);

    expect(repo.update).toHaveBeenCalledWith(
      "parcela-1",
      expect.objectContaining({
        status: "PAGO",
        dataPagamento: expect.any(Date),
        valorPago: parcelaFake.valor,
      }),
    );
  });

  it("lança NotFound quando a parcela não existe", async () => {
    repo.findById.mockResolvedValue(null);
    await expect(
      financeiroService.atualizar("x", { status: "CANCELADO" }, USUARIO),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
