import { beforeEach, describe, expect, it, vi } from "vitest";
import { matriculasService } from "../../src/modules/matriculas/matriculas.service";
import { matriculasRepository } from "../../src/modules/matriculas/matriculas.repository";
import { alunosRepository } from "../../src/modules/alunos/alunos.repository";
import { cursosRepository } from "../../src/modules/cursos/cursos.repository";
import { financeiroService } from "../../src/modules/financeiro/financeiro.service";
import { tiposCobrancaRepository } from "../../src/modules/tipos-cobranca/tipos-cobranca.repository";
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
vi.mock("../../src/modules/tipos-cobranca/tipos-cobranca.repository", () => ({
  tiposCobrancaRepository: { findManyByIds: vi.fn(), listObrigatoriosAtivos: vi.fn() },
}));
vi.mock("../../src/modules/auditoria/auditoria.service", () => ({
  registrarAuditoria: vi.fn(),
}));

const repo = vi.mocked(matriculasRepository);
const alunos = vi.mocked(alunosRepository);
const cursos = vi.mocked(cursosRepository);
const financeiro = vi.mocked(financeiroService);
const auditoria = vi.mocked(registrarAuditoria);
const tiposRepo = vi.mocked(tiposCobrancaRepository);

const ALUNO = "11111111-1111-1111-1111-111111111111";
const CURSO = "22222222-2222-2222-2222-222222222222";
const USUARIO = "usuario-1";
const matriculaFake = {
  id: "matricula-1",
  alunoId: ALUNO,
  cursoId: CURSO,
  numeroMatricula: "2026-1",
  _count: { parcelas: 0 },
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

describe("matriculasService.gerarParcelas", () => {
  it("rejeita quando faltam valorCurso/numeroParcelas/diaVencimento", async () => {
    repo.findById.mockResolvedValue({ ...matriculaFake, valorCurso: null } as never);

    await expect(matriculasService.gerarParcelas("matricula-1", USUARIO)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(financeiro.criar).not.toHaveBeenCalled();
  });

  it("rejeita quando a matrícula já tem parcelas geradas", async () => {
    repo.findById.mockResolvedValue({
      ...matriculaFake,
      valorCurso: 1200,
      numeroParcelas: 12,
      diaVencimento: 10,
      _count: { parcelas: 5 },
    } as never);

    await expect(matriculasService.gerarParcelas("matricula-1", USUARIO)).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(financeiro.criar).not.toHaveBeenCalled();
  });

  it("gera as parcelas a partir dos valores já salvos e audita", async () => {
    repo.findById.mockResolvedValue({
      ...matriculaFake,
      valorCurso: 1200,
      numeroParcelas: 12,
      diaVencimento: 10,
      dataMatricula: new Date(2020, 0, 5),
    } as never);

    const resultado = await matriculasService.gerarParcelas("matricula-1", USUARIO);

    expect(financeiro.criar).toHaveBeenCalledTimes(12);
    expect(resultado).toEqual({ parcelasGeradas: 12 });
    expect(auditoria).toHaveBeenCalledWith(
      expect.objectContaining({
        entidade: "Matricula",
        acao: "ATUALIZACAO",
        detalhes: expect.objectContaining({ acao: "parcelas_geradas" }),
      }),
    );
  });
});

describe("matriculasService.criar — cobranças por tipo", () => {
  const MENSALIDADE = {
    id: "11111111-aaaa-aaaa-aaaa-111111111111",
    nome: "Mensalidade",
    ativo: true,
    obrigatorio: true,
    usaValorDoCurso: true,
    valorPadrao: null,
    opcoesParcelas: [1, 6, 12],
    prefixoTitulo: null,
  };
  const TAXA = {
    id: "22222222-bbbb-bbbb-bbbb-222222222222",
    nome: "Taxa de matrícula",
    ativo: true,
    obrigatorio: false,
    usaValorDoCurso: false,
    valorPadrao: 49.9,
    opcoesParcelas: [1],
    prefixoTitulo: "TM",
  };

  beforeEach(() => {
    alunos.findById.mockResolvedValue({ id: ALUNO } as never);
    cursos.findById.mockResolvedValue({ id: CURSO, valorPadrao: 1200 } as never);
    repo.findByChaveNatural.mockResolvedValue(null);
    repo.create.mockResolvedValue(matriculaFake as never);
    tiposRepo.listObrigatoriosAtivos.mockResolvedValue([MENSALIDADE] as never);
  });

  it("gera mensalidade (valor do curso) e taxa (valor do tipo) com tipoTitulo e prefixo", async () => {
    tiposRepo.findManyByIds.mockResolvedValue([MENSALIDADE, TAXA] as never);

    await matriculasService.criar(
      {
        alunoId: ALUNO,
        cursoId: CURSO,
        cobrancas: [
          { tipoCobrancaId: MENSALIDADE.id, numeroParcelas: 6, primeiroVencimento: new Date(2026, 9, 31) },
          { tipoCobrancaId: TAXA.id, numeroParcelas: 1, primeiroVencimento: new Date(2026, 9, 31) },
        ],
      },
      USUARIO,
    );

    const chamadas = financeiro.criar.mock.calls.map(([i]) => i);
    expect(chamadas).toHaveLength(7);
    expect(chamadas[0]).toMatchObject({ codTitulo: "1", tipoTitulo: "Mensalidade", valor: 200 });
    // dia 31 em mês curto cai no último dia (novembro tem 30)
    expect(chamadas[1].vencimento.getDate()).toBe(30);
    expect(chamadas[6]).toMatchObject({ codTitulo: "TM1", tipoTitulo: "Taxa de matrícula", valor: 49.9 });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ valorCurso: 1200, numeroParcelas: 6, diaVencimento: 28 }),
    );
  });

  it("exige as cobranças obrigatórias", async () => {
    tiposRepo.findManyByIds.mockResolvedValue([TAXA] as never);
    await expect(
      matriculasService.criar(
        {
          alunoId: ALUNO,
          cursoId: CURSO,
          cobrancas: [{ tipoCobrancaId: TAXA.id, numeroParcelas: 1, primeiroVencimento: new Date() }],
        },
        USUARIO,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("recusa parcelamento fora das opções do tipo", async () => {
    tiposRepo.findManyByIds.mockResolvedValue([MENSALIDADE] as never);
    await expect(
      matriculasService.criar(
        {
          alunoId: ALUNO,
          cursoId: CURSO,
          cobrancas: [{ tipoCobrancaId: MENSALIDADE.id, numeroParcelas: 7, primeiroVencimento: new Date() }],
        },
        USUARIO,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("recusa quando o curso não tem valor e nada foi informado", async () => {
    cursos.findById.mockResolvedValue({ id: CURSO, valorPadrao: null } as never);
    tiposRepo.findManyByIds.mockResolvedValue([MENSALIDADE] as never);
    await expect(
      matriculasService.criar(
        {
          alunoId: ALUNO,
          cursoId: CURSO,
          cobrancas: [{ tipoCobrancaId: MENSALIDADE.id, numeroParcelas: 1, primeiroVencimento: new Date() }],
        },
        USUARIO,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
