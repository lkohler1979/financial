import { beforeEach, describe, expect, it, vi } from "vitest";
import { cursosService } from "../../src/modules/cursos/cursos.service";
import { cursosRepository } from "../../src/modules/cursos/cursos.repository";
import { registrarAuditoria } from "../../src/modules/auditoria/auditoria.service";
import { ConflictError, NotFoundError } from "../../src/shared/errors/app-error";

vi.mock("../../src/modules/cursos/cursos.repository", () => ({
  cursosRepository: {
    findById: vi.fn(),
    findByCodigo: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    countMatriculas: vi.fn(),
  },
}));

vi.mock("../../src/modules/auditoria/auditoria.service", () => ({
  registrarAuditoria: vi.fn(),
}));

const repo = vi.mocked(cursosRepository);
const auditoria = vi.mocked(registrarAuditoria);

const cursoFake = { id: "curso-1", codigo: "ADM", nome: "Administração", situacao: true };
const USUARIO = "usuario-1";

beforeEach(() => vi.clearAllMocks());

describe("cursosService.criar", () => {
  it("cria e audita quando o código é inédito", async () => {
    repo.findByCodigo.mockResolvedValue(null);
    repo.create.mockResolvedValue(cursoFake as never);

    await cursosService.criar({ codigo: "ADM", nome: "Administração" }, USUARIO);

    expect(repo.create).toHaveBeenCalledOnce();
    expect(auditoria).toHaveBeenCalledWith(expect.objectContaining({ acao: "CRIACAO" }));
  });

  it("rejeita código duplicado", async () => {
    repo.findByCodigo.mockResolvedValue(cursoFake as never);
    await expect(
      cursosService.criar({ codigo: "ADM", nome: "Outro" }, USUARIO),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("cursosService.atualizar", () => {
  it("permite manter o próprio código", async () => {
    repo.findById.mockResolvedValue(cursoFake as never);
    repo.findByCodigo.mockResolvedValue(cursoFake as never); // mesmo id
    repo.update.mockResolvedValue(cursoFake as never);

    await cursosService.atualizar("curso-1", { codigo: "ADM", nome: "Adm" }, USUARIO);
    expect(repo.update).toHaveBeenCalled();
  });

  it("rejeita quando o código pertence a outro curso", async () => {
    repo.findById.mockResolvedValue(cursoFake as never);
    repo.findByCodigo.mockResolvedValue({ ...cursoFake, id: "curso-2" } as never);

    await expect(
      cursosService.atualizar("curso-1", { codigo: "ADM" }, USUARIO),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("lança NotFound para curso inexistente", async () => {
    repo.findById.mockResolvedValue(null);
    await expect(cursosService.atualizar("x", { nome: "y" }, USUARIO)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("cursosService.remover", () => {
  it("bloqueia remoção com matrículas vinculadas", async () => {
    repo.findById.mockResolvedValue(cursoFake as never);
    repo.countMatriculas.mockResolvedValue(1);
    await expect(cursosService.remover("curso-1", USUARIO)).rejects.toBeInstanceOf(ConflictError);
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it("remove e audita quando não há matrículas", async () => {
    repo.findById.mockResolvedValue(cursoFake as never);
    repo.countMatriculas.mockResolvedValue(0);
    await cursosService.remover("curso-1", USUARIO);
    expect(repo.delete).toHaveBeenCalledWith("curso-1");
    expect(auditoria).toHaveBeenCalledWith(expect.objectContaining({ acao: "EXCLUSAO" }));
  });
});
