import { beforeEach, describe, expect, it, vi } from "vitest";
import { matriculasService } from "../../src/modules/matriculas/matriculas.service";
import { matriculasRepository } from "../../src/modules/matriculas/matriculas.repository";
import { alunosRepository } from "../../src/modules/alunos/alunos.repository";
import { cursosRepository } from "../../src/modules/cursos/cursos.repository";
import { financeiroService } from "../../src/modules/financeiro/financeiro.service";
import { registrarAuditoria } from "../../src/modules/auditoria/auditoria.service";
import { ConflictError, NotFoundError, ValidationError } from "../../src/shared/errors/app-error";

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
vi.mock("../../src/modules/financeiro/financeiro.service", () => ({
  financeiroService: { criar: vi.fn() },
}));
vi.mock("../../src/modules/auditoria/auditoria.service", () => ({
  registrarAuditoria: vi.fn(),
}));

const repo = vi.mocked(matriculasRepository);
const alunos = vi.mocked(alunosRepository);
const cursos = vi.mocked(cursosRepository);
const financeiro = vi.mocked(financeiroService);
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

describe("matriculasService.criar — geração automática de parcelas (Asaas)", () => {
  beforeEach(() => {
    alunos.findById.mockResolvedValue({ id: ALUNO } as never);
    cursos.findById.mockResolvedValue({ id: CURSO } as never);
    repo.findByChaveNatural.mockResolvedValue(null);
    repo.create.mockResolvedValue(matriculaFake as never);
  });

  it("não gera parcelas quando valorCurso/numeroParcelas não são informados", async () => {
    await matriculasService.criar({ alunoId: ALUNO, cursoId: CURSO }, USUARIO);
    expect(financeiro.criar).not.toHaveBeenCalled();
  });

  it("exige diaVencimento quando valorCurso e numeroParcelas são informados", async () => {
    await expect(
      matriculasService.criar(
        { alunoId: ALUNO, cursoId: CURSO, valorCurso: 1200, numeroParcelas: 12 },
        USUARIO,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.create).not.toHaveBeenCalled();
    expect(financeiro.criar).not.toHaveBeenCalled();
  });

  it("gera N parcelas mensais com valores iguais quando a divisão é exata", async () => {
    await matriculasService.criar(
      {
        alunoId: ALUNO,
        cursoId: CURSO,
        valorCurso: 1200,
        numeroParcelas: 12,
        diaVencimento: 10,
        dataMatricula: new Date(2020, 0, 5), // bem no passado: sempre cai no "mês seguinte" de forma determinística
      },
      USUARIO,
    );

    expect(financeiro.criar).toHaveBeenCalledTimes(12);
    const chamadas = financeiro.criar.mock.calls;
    expect(chamadas[0][0]).toMatchObject({
      matriculaId: matriculaFake.id,
      codTitulo: "1",
      parcela: "1/12",
      valor: 100,
    });
    expect(chamadas[11][0]).toMatchObject({ codTitulo: "12", parcela: "12/12", valor: 100 });
    const somaValores = chamadas.reduce((soma, [input]) => soma + (input.valor as number), 0);
    expect(somaValores).toBeCloseTo(1200, 2);
  });

  it("a última parcela absorve a diferença de arredondamento", async () => {
    await matriculasService.criar(
      {
        alunoId: ALUNO,
        cursoId: CURSO,
        valorCurso: 100,
        numeroParcelas: 3,
        diaVencimento: 15,
        dataMatricula: new Date(2020, 0, 5),
      },
      USUARIO,
    );

    const chamadas = financeiro.criar.mock.calls;
    const valores = chamadas.map(([input]) => input.valor as number);
    expect(valores[0]).toBe(33.33);
    expect(valores[1]).toBe(33.33);
    expect(valores[2]).toBe(33.34);
    expect(valores.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 2);
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
