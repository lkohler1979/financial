import { beforeEach, describe, expect, it, vi } from "vitest";
import { alunosService } from "../../src/modules/alunos/alunos.service";
import { alunosRepository } from "../../src/modules/alunos/alunos.repository";
import { registrarAuditoria } from "../../src/modules/auditoria/auditoria.service";
import { ConflictError, NotFoundError } from "../../src/shared/errors/app-error";

vi.mock("../../src/modules/alunos/alunos.repository", () => ({
  alunosRepository: {
    findById: vi.fn(),
    findByCpf: vi.fn(),
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

const repo = vi.mocked(alunosRepository);
const auditoria = vi.mocked(registrarAuditoria);

const alunoFake = {
  id: "aluno-1",
  cpf: "39053344705",
  nome: "Maria Silva",
};

const USUARIO = "usuario-1";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("alunosService.criar", () => {
  it("cria o aluno e registra auditoria de criação quando o CPF não existe", async () => {
    repo.findByCpf.mockResolvedValue(null);
    repo.create.mockResolvedValue(alunoFake as never);

    const resultado = await alunosService.criar(
      { cpf: "39053344705", nome: "Maria Silva" },
      USUARIO,
    );

    expect(resultado).toBe(alunoFake);
    expect(repo.create).toHaveBeenCalledOnce();
    expect(auditoria).toHaveBeenCalledWith(
      expect.objectContaining({ entidade: "Aluno", acao: "CRIACAO", usuarioId: USUARIO }),
    );
  });

  it("rejeita quando já existe aluno com o mesmo CPF", async () => {
    repo.findByCpf.mockResolvedValue(alunoFake as never);

    await expect(
      alunosService.criar({ cpf: "39053344705", nome: "Outra" }, USUARIO),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(repo.create).not.toHaveBeenCalled();
    expect(auditoria).not.toHaveBeenCalled();
  });
});

describe("alunosService.buscarPorId", () => {
  it("lança NotFound quando o aluno não existe", async () => {
    repo.findById.mockResolvedValue(null);
    await expect(alunosService.buscarPorId("x")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("alunosService.atualizar", () => {
  it("atualiza e registra auditoria de atualização", async () => {
    repo.findById.mockResolvedValue(alunoFake as never);
    repo.update.mockResolvedValue({ ...alunoFake, nome: "Maria S." } as never);

    await alunosService.atualizar("aluno-1", { nome: "Maria S." }, USUARIO);

    expect(repo.update).toHaveBeenCalledWith("aluno-1", { nome: "Maria S." });
    expect(auditoria).toHaveBeenCalledWith(
      expect.objectContaining({ acao: "ATUALIZACAO", entidadeId: "aluno-1" }),
    );
  });
});

describe("alunosService.remover", () => {
  it("remove quando o aluno não possui matrículas", async () => {
    repo.findById.mockResolvedValue(alunoFake as never);
    repo.countMatriculas.mockResolvedValue(0);

    await alunosService.remover("aluno-1", USUARIO);

    expect(repo.delete).toHaveBeenCalledWith("aluno-1");
    expect(auditoria).toHaveBeenCalledWith(expect.objectContaining({ acao: "EXCLUSAO" }));
  });

  it("bloqueia remoção quando há matrículas vinculadas (append-first)", async () => {
    repo.findById.mockResolvedValue(alunoFake as never);
    repo.countMatriculas.mockResolvedValue(2);

    await expect(alunosService.remover("aluno-1", USUARIO)).rejects.toBeInstanceOf(ConflictError);
    expect(repo.delete).not.toHaveBeenCalled();
  });
});
