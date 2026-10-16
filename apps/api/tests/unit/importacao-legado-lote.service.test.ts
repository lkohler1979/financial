import { beforeEach, describe, expect, it, vi } from "vitest";
import { importacaoLegadoLoteService } from "../../src/modules/importacao-legado/importacao-legado-lote.service";
import { importacaoLegadoLoteRepository as repo } from "../../src/modules/importacao-legado/importacao-legado-lote.repository";
import { alunosRepository } from "../../src/modules/alunos/alunos.repository";
import { cursosRepository } from "../../src/modules/cursos/cursos.repository";
import { matriculasRepository } from "../../src/modules/matriculas/matriculas.repository";
import { financeiroRepository } from "../../src/modules/financeiro/financeiro.repository";
import { situacoesRepository } from "../../src/modules/cobranca/situacoes.repository";
import { importacaoLegadoLoteQueue } from "../../src/jobs/queues/importacao-legado-lote.queue";
import type {
  LegadoPessoaCurso,
  LegadoTituloResumo,
} from "../../src/modules/sincronizacao-legado/legado-client";

vi.mock("../../src/modules/importacao-legado/importacao-legado-lote.repository", () => ({
  importacaoLegadoLoteRepository: {
    criar: vi.fn(),
    findById: vi.fn(),
    ultimo: vi.fn(),
    atualizar: vi.fn(),
    emAndamento: vi.fn(),
    registrarOcorrencias: vi.fn(),
    contarOcorrenciasPorTipo: vi.fn(),
    listarOcorrencias: vi.fn(),
  },
}));
vi.mock("../../src/jobs/queues/importacao-legado-lote.queue", () => ({
  importacaoLegadoLoteQueue: { add: vi.fn() },
}));
vi.mock("../../src/modules/alunos/alunos.repository", () => ({
  alunosRepository: { findByCpf: vi.fn(), create: vi.fn() },
}));
vi.mock("../../src/modules/cursos/cursos.repository", () => ({
  cursosRepository: {
    findByNome: vi.fn(),
    findByCodigo: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  },
}));
vi.mock("../../src/modules/matriculas/matriculas.repository", () => ({
  matriculasRepository: { findByAlunoECurso: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
vi.mock("../../src/modules/financeiro/financeiro.repository", () => ({
  financeiroRepository: { listarTodasPorMatricula: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
vi.mock("../../src/modules/cobranca/situacoes.repository", () => ({
  situacoesRepository: { obterOuCriarPorNome: vi.fn() },
}));
vi.mock("../../src/modules/cobranca/historico.repository", () => ({
  historicoRepository: { registrar: vi.fn() },
}));
vi.mock("../../src/modules/auditoria/auditoria.service", () => ({ registrarAuditoria: vi.fn() }));
vi.mock("../../src/modules/sincronizacao-legado/sincronizacao-legado.service", () => ({
  montarClient: vi.fn(),
}));

const lote = vi.mocked(repo);
const alunos = vi.mocked(alunosRepository);
const cursos = vi.mocked(cursosRepository);
const matriculas = vi.mocked(matriculasRepository);
const financeiro = vi.mocked(financeiroRepository);

function pessoa(
  pesId: string,
  nome: string,
  cpf: string,
  cursoNome: string,
  alunocursoId: string,
  cursoId = alunocursoId ? `c-${alunocursoId}` : "",
  cursocampusId = "",
): LegadoPessoaCurso {
  return {
    pesId,
    alunoId: pesId,
    nome,
    cpf,
    alunocursoId,
    alunocursoSituacao: "Ativo",
    cursoId,
    cursoNome,
    cursoSigla: "SIG",
    cursocampusId,
  };
}

function titulo(
  tituloId: string,
  alunocursoId: string,
  estado = "Aberto",
  vencimento: string | null = "2026-10-10 00:00:00",
  cursoNome = "x",
  cursocampusId = "",
): LegadoTituloResumo {
  return {
    tituloId,
    alunocursoId,
    cursoNome,
    tituloDescricao: "Mensalidade",
    tituloParcela: "1/12",
    tituloEstado: estado,
    tituloValor: 100,
    tituloValorPago: 0,
    tituloDataVencimento: vencimento,
    tituloDataPagamento: null,
    tituloDataBaixa: null,
    diasAtraso: 0,
    multaCalc: 0,
    jurosCalc: 0,
    totalCalc: 100,
    tipoTituloId: 2,
    tipoTituloNome: "Mensalidade",
    tituloObservacoes: null,
    cursocampusId,
    cursoSigla: "",
  };
}

/** Legado: Ana (curso já cadastrado), Bia (curso novo), Empresa (sem CPF), Caio (sem matrícula). */
function legadoFalso(titulos?: Record<string, LegadoTituloResumo[]>) {
  const base = [
    pessoa("1", "Ana Souza", "529.982.247-25", "Pós em Segurança", "ac-1"),
    pessoa("2", "Bia Lima", "111.444.777-35", "Curso Novo do Legado", "ac-2"),
    pessoa("3", "Empresa Ltda", "", "Pós em Segurança", "ac-3"),
    pessoa("4", "Caio Dias", "390.533.447-05", "", "", ""),
  ];
  const porPessoa = titulos ?? {
    "1": [titulo("0001", "ac-1"), titulo("0002", "ac-1", "Pago")],
    "2": [titulo("0003", "ac-2")],
  };
  return {
    buscarPessoasPorPrefixoNome: vi.fn(async (prefixo: string) => (prefixo === "a" ? base : [])),
    buscarTitulosPorPessoa: vi.fn(async (pesId: string) => porPessoa[pesId] ?? []),
  };
}

function ocorrenciasGravadas() {
  return lote.registrarOcorrencias.mock.calls.flatMap((c) => c[1]);
}

beforeEach(() => {
  vi.resetAllMocks();
  lote.findById.mockResolvedValue({ id: "l1", limite: null } as never);
  lote.registrarOcorrencias.mockResolvedValue(undefined as never);
  vi.mocked(situacoesRepository.obterOuCriarPorNome).mockResolvedValue({
    id: "s1",
    nome: "PENDENTE",
  } as never);
  // "Pós em Segurança" já existe (por nome); o resto não.
  cursos.findByCodigo.mockResolvedValue(null);
  cursos.findByNome.mockImplementation(async (nome: string) =>
    nome === "Pós em Segurança" ? ({ id: "curso-seg", nome } as never) : null,
  );
  cursos.create.mockImplementation(
    async (dados) => ({ id: `novo-${dados.codigo}`, ...dados }) as never,
  );
  alunos.findByCpf.mockResolvedValue(null);
  alunos.create.mockImplementation(async (d) => ({ id: `aluno-${d.cpf}` }) as never);
  matriculas.findByAlunoECurso.mockResolvedValue(null);
  matriculas.create.mockResolvedValue({ id: "mat-1", situacaoCobrancaId: null } as never);
  financeiro.listarTodasPorMatricula.mockResolvedValue([]);
  financeiro.create.mockResolvedValue({ id: "p1" } as never);
});

describe("importacaoLegadoLoteService.executar", () => {
  it("cria o curso que não existe (com o código do legado) e segue com matrícula e parcelas", async () => {
    await importacaoLegadoLoteService.executar("l1", "u1", legadoFalso() as never);

    expect(cursos.create).toHaveBeenCalledTimes(1);
    expect(cursos.create).toHaveBeenCalledWith(
      expect.objectContaining({
        codigo: "c-ac-2",
        nome: "Curso Novo do Legado",
        situacao: true,
        observacoes: expect.stringContaining("sigla SIG"),
      }),
    );
    // Ana (curso existente) + Bia (curso novo) + Caio (sem matrícula) => 3 alunos, 2 matrículas.
    expect(alunos.create).toHaveBeenCalledTimes(3);
    expect(matriculas.create).toHaveBeenCalledTimes(2);
    expect(matriculas.create).toHaveBeenCalledWith(
      expect.objectContaining({ curso: { connect: { id: "novo-c-ac-2" } } }),
    );
    expect(financeiro.create).toHaveBeenCalledTimes(3);

    const final = lote.atualizar.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(final).toMatchObject({
      status: "CONCLUIDO",
      pessoasProcessadas: 4,
      alunosCriados: 3,
      matriculasNovas: 2,
      cursosCriados: 1,
      parcelasNovas: 3,
      parcelasAtualizadas: 0,
      semCpf: 1,
      erros: 0,
    });
  });

  it("encontra o curso pelo código do legado antes de tentar o nome (não duplica)", async () => {
    cursos.findByCodigo.mockImplementation(async (codigo: string) =>
      codigo === "c-ac-2" ? ({ id: "curso-existente", nome: "Nome diferente" } as never) : null,
    );
    await importacaoLegadoLoteService.executar("l1", "u1", legadoFalso() as never);
    expect(cursos.create).not.toHaveBeenCalled();
    expect(matriculas.create).toHaveBeenCalledWith(
      expect.objectContaining({ curso: { connect: { id: "curso-existente" } } }),
    );
  });

  it("registra no relatório: sem CPF, matrícula não realizada, aluno sem matrícula e curso criado", async () => {
    await importacaoLegadoLoteService.executar("l1", "u1", legadoFalso() as never);

    const porTipo = (tipo: string) => ocorrenciasGravadas().filter((o) => o.tipo === tipo);
    expect(porTipo("ALUNO_SEM_CPF")).toEqual([
      expect.objectContaining({ pessoaNome: "Empresa Ltda", pesId: "3" }),
    ]);
    expect(porTipo("MATRICULA_NAO_REALIZADA")).toEqual([
      expect.objectContaining({
        pessoaNome: "Empresa Ltda",
        curso: "Pós em Segurança",
        motivo: expect.stringContaining("sem CPF"),
      }),
    ]);
    expect(porTipo("ALUNO_SEM_MATRICULA")).toEqual([
      expect.objectContaining({ pessoaNome: "Caio Dias", cpf: "390.533.447-05" }),
    ]);
    expect(porTipo("CURSO_CRIADO")).toEqual([
      expect.objectContaining({ curso: "Curso Novo do Legado" }),
    ]);
  });

  it("parcela sem vencimento válido e título de matrícula não importada vão para o relatório", async () => {
    const legado = legadoFalso({
      "1": [titulo("0001", "ac-1", "Aberto", null), titulo("0009", "ac-solta")],
    });
    await importacaoLegadoLoteService.executar("l1", "u1", legado as never);

    const parcelas = ocorrenciasGravadas().filter((o) => o.tipo === "PARCELA_NAO_IMPORTADA");
    expect(parcelas.map((p) => p.motivo)).toEqual([
      "sem data de vencimento válida",
      "Título de uma matrícula que não foi importada",
    ]);
    expect(parcelas[0]).toMatchObject({
      pessoaNome: "Ana Souza",
      titulo: expect.stringContaining("0001"),
    });
  });

  it("título de outra matrícula no mesmo curso entra na matrícula do curso (a busca traz 1 linha por curso)", async () => {
    const legado = legadoFalso({
      "1": [
        titulo("0001", "ac-1"),
        // 2ª matrícula do aluno no mesmo curso: id diferente, mesmo nome de curso (com outra caixa/acento).
        titulo("0002", "ac-OUTRA", "Aberto", "2026-10-10 00:00:00", "POS EM SEGURANCA"),
      ],
    });
    await importacaoLegadoLoteService.executar("l1", "u1", legado as never);

    expect(financeiro.create).toHaveBeenCalledWith(expect.objectContaining({ codTitulo: "0001" }));
    expect(financeiro.create).toHaveBeenCalledWith(expect.objectContaining({ codTitulo: "0002" }));
    expect(ocorrenciasGravadas().filter((o) => o.tipo === "PARCELA_NAO_IMPORTADA")).toEqual([]);
  });

  it("curso que só aparece nos títulos (a busca traz só o 1º curso) é descoberto, cadastrado e recebe a matrícula", async () => {
    const base = [
      // Ana: o legado devolve só o 1º curso (campus K1).
      pessoa("1", "Ana Souza", "529.982.247-25", "Pós em Segurança", "ac-1", "c-ac-1", "K1"),
      // Outra pessoa tem o curso B como 1º curso: é daí que vem o código (222) da oferta K2.
      pessoa("2", "Bia Lima", "111.444.777-35", "Curso B", "ac-2", "00000000222", "K2"),
    ];
    const legado = {
      buscarPessoasPorPrefixoNome: vi.fn(async (prefixo: string) => (prefixo === "a" ? base : [])),
      buscarTitulosPorPessoa: vi.fn(async (pesId: string) =>
        pesId === "1"
          ? [
              titulo("0001", "ac-1", "Aberto", "2026-10-10 00:00:00", "Pós em Segurança", "K1"),
              // 2º curso da Ana: id de matrícula e campus que não vieram na linha dela.
              titulo("0050", "ac-9", "Aberto", "2026-10-10 00:00:00", "Curso B", "K2"),
            ]
          : [],
      ),
    };
    await importacaoLegadoLoteService.executar("l1", "u1", legado as never);

    // Código sem zeros à esquerda, igual ao da planilha.
    expect(cursos.findByCodigo).toHaveBeenCalledWith("222");
    expect(cursos.create).toHaveBeenCalledTimes(1);
    expect(cursos.create).toHaveBeenCalledWith(
      expect.objectContaining({ codigo: "222", nome: "Curso B" }),
    );
    // Ana ganhou matrículas nos dois cursos, com a parcela de cada um.
    expect(matriculas.create).toHaveBeenCalledWith(
      expect.objectContaining({
        aluno: { connect: { id: "aluno-52998224725" } },
        curso: { connect: { id: "novo-222" } },
      }),
    );
    expect(financeiro.create).toHaveBeenCalledWith(expect.objectContaining({ codTitulo: "0050" }));
    expect(ocorrenciasGravadas().filter((o) => o.tipo === "PARCELA_NAO_IMPORTADA")).toEqual([]);
  });

  it("é idempotente: aluno/matrícula/parcelas que já existem não são recriados", async () => {
    alunos.findByCpf.mockResolvedValue({ id: "aluno-1" } as never);
    matriculas.findByAlunoECurso.mockResolvedValue({
      id: "mat-1",
      situacaoCobrancaId: "s1",
    } as never);
    financeiro.listarTodasPorMatricula.mockResolvedValue([
      {
        id: "p1",
        codTitulo: "1",
        status: "EM_ABERTO",
        valor: 100,
        valorPago: null,
        dataPagamento: null,
      },
      {
        id: "p2",
        codTitulo: "2",
        status: "EM_ABERTO",
        valor: 100,
        valorPago: null,
        dataPagamento: null,
      },
    ] as never);

    await importacaoLegadoLoteService.executar("l1", "u1", legadoFalso() as never);

    expect(alunos.create).not.toHaveBeenCalled();
    expect(matriculas.create).not.toHaveBeenCalled();
    expect(financeiro.update).toHaveBeenCalled(); // existentes só são atualizadas
  });

  it("erro numa pessoa não derruba o lote: conta e registra no relatório", async () => {
    alunos.create.mockRejectedValueOnce(new Error("CPF duplicado"));
    await importacaoLegadoLoteService.executar("l1", "u1", legadoFalso() as never);

    const final = lote.atualizar.mock.calls.at(-1)?.[1] as { status: string; erros: number };
    expect(final).toMatchObject({ status: "CONCLUIDO", erros: 1 });
    expect(ocorrenciasGravadas().find((o) => o.tipo === "ERRO")).toMatchObject({
      pessoaNome: "Ana Souza",
      motivo: "CPF duplicado",
    });
  });

  it("falha na varredura (legado fora do ar) marca o lote como FALHOU com o motivo", async () => {
    const legado = {
      buscarPessoasPorPrefixoNome: vi
        .fn()
        .mockRejectedValue(new Error("Sistema legado respondeu 500")),
      buscarTitulosPorPessoa: vi.fn(),
    };
    await expect(importacaoLegadoLoteService.executar("l1", "u1", legado as never)).rejects.toThrow(
      /500/,
    );
    expect(lote.atualizar.mock.calls.at(-1)?.[1]).toMatchObject({
      status: "FALHOU",
      mensagemFalha: "Sistema legado respondeu 500",
    });
  });

  it("respeita o limite de pessoas do lote", async () => {
    lote.findById.mockResolvedValue({ id: "l1", limite: 1 } as never);
    await importacaoLegadoLoteService.executar("l1", "u1", legadoFalso() as never);
    expect(
      (lote.atualizar.mock.calls.at(-1)?.[1] as { pessoasProcessadas: number }).pessoasProcessadas,
    ).toBe(1);
  });
});

describe("importacaoLegadoLoteService.iniciar", () => {
  it("cria o lote e enfileira o job", async () => {
    lote.emAndamento.mockResolvedValue(null);
    lote.criar.mockResolvedValue({ id: "l9" } as never);
    await importacaoLegadoLoteService.iniciar("u1");
    expect(importacaoLegadoLoteQueue.add).toHaveBeenCalledWith("importar-lote", {
      loteId: "l9",
      usuarioId: "u1",
    });
  });

  it("recusa iniciar outro enquanto há um em andamento", async () => {
    lote.emAndamento.mockResolvedValue({ id: "l1" } as never);
    await expect(importacaoLegadoLoteService.iniciar("u1")).rejects.toThrow(/em andamento/);
    expect(importacaoLegadoLoteQueue.add).not.toHaveBeenCalled();
  });
});

describe("importacaoLegadoLoteService.relatorio", () => {
  it("gera a planilha com o resumo e uma aba por tipo de ocorrência", async () => {
    lote.ultimo.mockResolvedValue({
      id: "abcdef12-0000",
      status: "CONCLUIDO",
      criadoEm: new Date(),
      finalizadoEm: new Date(),
      pessoasEncontradas: 4,
      pessoasProcessadas: 4,
      alunosCriados: 3,
      matriculasNovas: 2,
      cursosCriados: 1,
      parcelasNovas: 3,
      parcelasAtualizadas: 0,
      semCpf: 1,
      erros: 0,
      mensagemFalha: null,
    } as never);
    lote.listarOcorrencias.mockResolvedValue([
      {
        tipo: "ALUNO_SEM_CPF",
        pessoaNome: "Empresa Ltda",
        cpf: null,
        pesId: "3",
        curso: null,
        titulo: null,
        motivo: "sem CPF",
      },
      {
        tipo: "CURSO_CRIADO",
        pessoaNome: null,
        cpf: null,
        pesId: null,
        curso: "Curso Novo",
        titulo: null,
        motivo: "criado",
      },
    ] as never);

    const { arquivo, nome } = await importacaoLegadoLoteService.relatorio("atual");
    expect(nome).toBe("importacao-legado-abcdef12.xlsx");

    const XLSX = await import("xlsx");
    const livro = XLSX.read(arquivo, { type: "buffer" });
    expect(livro.SheetNames).toEqual(["Resumo", "Alunos sem CPF", "Cursos criados"]);
    const linhas = XLSX.utils.sheet_to_json<Record<string, string>>(livro.Sheets["Alunos sem CPF"]);
    expect(linhas[0]).toMatchObject({ Pessoa: "Empresa Ltda", Motivo: "sem CPF" });
  });

  it("sem nenhum lote devolve 404", async () => {
    lote.ultimo.mockResolvedValue(null);
    await expect(importacaoLegadoLoteService.relatorio("atual")).rejects.toThrow(/Nenhuma busca/);
  });
});
