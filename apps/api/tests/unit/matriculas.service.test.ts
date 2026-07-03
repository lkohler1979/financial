import { beforeEach, describe, expect, it, vi } from "vitest";
import { matriculasService } from "../../src/modules/matriculas/matriculas.service";
import { matriculasRepository } from "../../src/modules/matriculas/matriculas.repository";
import { alunosRepository } from "../../src/modules/alunos/alunos.repository";
import { cursosRepository } from "../../src/modules/cursos/cursos.repository";
import { registrarAuditoria } from "../../src/modules/auditoria/auditoria.service";
import { ConflictError, NotFoundError } from "../../src/shared/errors/app-error";

vi.mock("../../src/modules/matriculas/matriculas.repository", () => ({
  matriculasRepository: {
    findById: vi.fn(),
    findByChaveNatural: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    countParcelas: vi.fn(),
  },
}));
vi.mock("../../src/modules/alunos/alunos.repository", () => ({
  alunosRepository: { findById: vi.fn() },
}));
vi.mock("../../src/modules/cursos/cursos.repository", () => ({
  cursosRepository: { findById: vi.fn() },
}));
vi.mock("../../src/modules/auditoria/auditoria.service", () => ({
  registrarAuditoria: vi.fn(),
}));

const repo = vi.mocked(matriculasRepository);
const alunos = vi.mocked(alunosRepository);
const cursos = vi.mocked(cursosRepository);
const auditoria = vi.mocked(registrarAuditoria);

const ALUNO = "11111111-1111-1111-1111-111111111111";
const CURSO = "22222222-2222-2222-2222-222222222222";
const USUARIO = "usuario-1";
const matriculaFake = {
  id: "matricula-1",
  alunoId: ALUNO,
  cursoId: CURSO,
  numeroMatricula: "2026-1",
};

beforeEach(() => vi.clearAllMocks());

describe("matriculasService.criar", () => {
  it("cria e audita quando aluno e curso existem e a chave natural está livre", async () => {
    alunos.findById.mockResolvedValue({ id: ALUNO } as never);
    cursos.findById.mockResolvedValue({ id: CURSO } as never);
    repo.findByChaveNatural.mockResolvedValue(null);
    repo.create.mockResolvedValue(matriculaFake as never);

    await matriculasService.criar(
      { alunoId: ALUNO, cursoId: CURSO, numeroMatricula: "2026-1" },
      USUARIO,
    );

    expect(repo.create).toHaveBeenCalledOnce();
    expect(auditoria).toHaveBeenCalledWith(
      expect.objectContaining({ entidade: "Matricula", acao: "CRIACAO" }),
    );
  });

  it("rejeita quando o aluno não existe", async () => {
    alunos.findById.mockResolvedValue(null);
    await expect(
      matriculasService.criar({ alunoId: ALUNO, cursoId: CURSO }, USUARIO),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("rejeita quando o curso não existe", async () => {
    alunos.findById.mockResolvedValue({ id: ALUNO } as never);
    cursos.findById.mockResolvedValue(null);
    await expect(
      matriculasService.criar({ alunoId: ALUNO, cursoId: CURSO }, USUARIO),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejeita chave natural duplicada (aluno+curso+número)", async () => {
    alunos.findById.mockResolvedValue({ id: ALUNO } as never);
    cursos.findById.mockResolvedValue({ id: CURSO } as never);
    repo.findByChaveNatural.mockResolvedValue({ id: "outra" } as never);

    await expect(
      matriculasService.criar(
        { alunoId: ALUNO, cursoId: CURSO, numeroMatricula: "2026-1" },
        USUARIO,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("matriculasService.remover", () => {
  it("bloqueia remoção quando há parcelas vinculadas (append-first)", async () => {
    repo.findById.mockResolvedValue(matriculaFake as never);
    repo.countParcelas.mockResolvedValue(3);

    await expect(matriculasService.remover("matricula-1", USUARIO)).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it("remove e audita quando não há parcelas", async () => {
    repo.findById.mockResolvedValue(matriculaFake as never);
    repo.countParcelas.mockResolvedValue(0);

    await matriculasService.remover("matricula-1", USUARIO);
    expect(repo.delete).toHaveBeenCalledWith("matricula-1");
    expect(auditoria).toHaveBeenCalledWith(expect.objectContaining({ acao: "EXCLUSAO" }));
  });
});
