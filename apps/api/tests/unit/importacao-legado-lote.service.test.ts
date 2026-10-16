import { beforeEach, describe, expect, it, vi } from "vitest";
import { importacaoLegadoLoteService } from "../../src/modules/importacao-legado/importacao-legado-lote.service";
import { importacaoLegadoLoteRepository as repo } from "../../src/modules/importacao-legado/importacao-legado-lote.repository";
import { alunosRepository } from "../../src/modules/alunos/alunos.repository";
import { cursosRepository } from "../../src/modules/cursos/cursos.repository";
import { matriculasRepository } from "../../src/modules/matriculas/matriculas.repository";
import { financeiroRepository } from "../../src/modules/financeiro/financeiro.repository";
import { situacoesRepository } from "../../src/modules/cobranca/situacoes.repository";
import { importacaoLegadoLoteQueue } from "../../src/jobs/queues/importacao-legado-lote.queue";
import type { LegadoPessoaCurso, LegadoTituloResumo } from "../../src/modules/sincronizacao-legado/legado-client";

vi.mock("../../src/modules/importacao-legado/importacao-legado-lote.repository", () => ({
  importacaoLegadoLoteRepository: { criar: vi.fn(), findById: vi.fn(), ultimo: vi.fn(), atualizar: vi.fn(), emAndamento: vi.fn() },
}));
vi.mock("../../src/jobs/queues/importacao-legado-lote.queue", () => ({ importacaoLegadoLoteQueue: { add: vi.fn() } }));
vi.mock("../../src/modules/alunos/alunos.repository", () => ({ alunosRepository: { findByCpf: vi.fn(), create: vi.fn() } }));
vi.mock("../../src/modules/cursos/cursos.repository", () => ({ cursosRepository: { findByNome: vi.fn(), findById: vi.fn() } }));
vi.mock("../../src/modules/matriculas/matriculas.repository", () => ({
  matriculasRepository: { findByAlunoECurso: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
vi.mock("../../src/modules/financeiro/financeiro.repository", () => ({
  financeiroRepository: { listarTodasPorMatricula: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
vi.mock("../../src/modules/cobranca/situacoes.repository", () => ({ situacoesRepository: { obterOuCriarPorNome: vi.fn() } }));
vi.mock("../../src/modules/cobranca/historico.repository", () => ({ historicoRepository: { registrar: vi.fn() } }));
vi.mock("../../src/modules/auditoria/auditoria.service", () => ({ registrarAuditoria: vi.fn() }));
vi.mock("../../src/modules/sincronizacao-legado/sincronizacao-legado.service", () => ({ montarClient: vi.fn() }));

const lote = vi.mocked(repo);
const alunos = vi.mocked(alunosRepository);
const cursos = vi.mocked(cursosRepository);
const matriculas = vi.mocked(matriculasRepository);
const financeiro = vi.mocked(financeiroRepository);

function pessoa(pesId: string, nome: string, cpf: string, cursoNome: string, alunocursoId: string): LegadoPessoaCurso {
  return { pesId, alunoId: pesId, nome, cpf, alunocursoId, alunocursoSituacao: "Ativo", cursoId: "1", cursoNome };
}

function titulo(tituloId: string, alunocursoId: string, estado = "Aberto"): LegadoTituloResumo {
  return {
    tituloId, alunocursoId, cursoNome: "x", tituloDescricao: "Mensalidade", tituloParcela: "1/12", tituloEstado: estado,
    tituloValor: 100, tituloValorPago: 0, tituloDataVencimento: "2026-10-10 00:00:00", tituloDataPagamento: null,
    tituloDataBaixa: null, diasAtraso: 0, multaCalc: 0, jurosCalc: 0, totalCalc: 100, tipoTituloId: 2,
    tipoTituloNome: "Mensalidade", tituloObservacoes: null,
  };
}

/** Legado com 3 pessoas: Ana (curso conhecido), Bia (curso desconhecido), Empresa (sem CPF). */
function legadoFalso() {
  const base = [
    pessoa("1", "Ana Souza", "529.982.247-25", "Pós em Segurança", "ac-1"),
    pessoa("2", "Bia Lima", "111.444.777-35", "Curso Que Não Existe", "ac-2"),
    pessoa("3", "Empresa Ltda", "", "Pós em Segurança", "ac-3"),
  ];
  return {
    buscarPessoasPorPrefixoNome: vi.fn(async (prefixo: string) => (prefixo === "a" ? base : [])),
    buscarTitulosPorPessoa: vi.fn(async (pesId: string) => (pesId === "1" ? [titulo("0001", "ac-1"), titulo("0002", "ac-1", "Pago")] : [])),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  lote.findById.mockResolvedValue({ id: "l1", limite: null } as never);
  vi.mocked(situacoesRepository.obterOuCriarPorNome).mockResolvedValue({ id: "s1", nome: "PENDENTE" } as never);
  cursos.findByNome.mockImplementation(async (nome: string) => (nome === "Pós em Segurança" ? ({ id: "curso-1" } as never) : null));
  alunos.findByCpf.mockResolvedValue(null);
  alunos.create.mockResolvedValue({ id: "aluno-1" } as never);
  matriculas.findByAlunoECurso.mockResolvedValue(null);
  matriculas.create.mockResolvedValue({ id: "mat-1", situacaoCobrancaId: null } as never);
  financeiro.listarTodasPorMatricula.mockResolvedValue([]);
  financeiro.create.mockResolvedValue({ id: "p1" } as never);
});

describe("importacaoLegadoLoteService.executar", () => {
  it("varre, cria aluno/matrícula/parcelas dos cursos conhecidos e resume o que foi ignorado", async () => {
    await importacaoLegadoLoteService.executar("l1", "u1", legadoFalso() as never);

    expect(alunos.create).toHaveBeenCalledTimes(1);
    expect(alunos.create).toHaveBeenCalledWith({ cpf: "52998224725", nome: "Ana Souza" });
    expect(matriculas.create).toHaveBeenCalledTimes(1);
    expect(financeiro.create).toHaveBeenCalledTimes(2);
    expect(financeiro.create).toHaveBeenCalledWith(expect.objectContaining({ codTitulo: "0001", tipoTitulo: "Mensalidade" }));

    const final = lote.atualizar.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(final).toMatchObject({
      status: "CONCLUIDO",
      pessoasProcessadas: 3,
      alunosCriados: 1,
      matriculasNovas: 1,
      parcelasNovas: 2,
      parcelasAtualizadas: 0,
      semCpf: 1,
      erros: 0,
      cursosSemCorrespondencia: { "Curso Que Não Existe": 1 },
    });
  });

  it("é idempotente: aluno/matrícula/parcelas que já existem não são recriados", async () => {
    alunos.findByCpf.mockResolvedValue({ id: "aluno-1" } as never);
    matriculas.findByAlunoECurso.mockResolvedValue({ id: "mat-1", situacaoCobrancaId: "s1" } as never);
    financeiro.listarTodasPorMatricula.mockResolvedValue([
      { id: "p1", codTitulo: "1", status: "EM_ABERTO", valor: 100, valorPago: null, dataPagamento: null },
      { id: "p2", codTitulo: "2", status: "EM_ABERTO", valor: 100, valorPago: null, dataPagamento: null },
    ] as never);

    await importacaoLegadoLoteService.executar("l1", "u1", legadoFalso() as never);

    expect(alunos.create).not.toHaveBeenCalled();
    expect(matriculas.create).not.toHaveBeenCalled();
    expect(financeiro.create).not.toHaveBeenCalled(); // "0001" casa com "1" (sem zeros à esquerda)
    expect(financeiro.update).toHaveBeenCalled(); // existentes só são atualizadas (situação/valores do legado)
  });

  it("erro numa pessoa não derruba o lote: conta o erro e segue", async () => {
    alunos.create.mockRejectedValueOnce(new Error("CPF duplicado"));
    await importacaoLegadoLoteService.executar("l1", "u1", legadoFalso() as never);
    const final = lote.atualizar.mock.calls.at(-1)?.[1] as { status: string; erros: number; detalhes: { erros: string[] } };
    expect(final.status).toBe("CONCLUIDO");
    expect(final.erros).toBe(1);
    expect(final.detalhes.erros[0]).toBe("Ana Souza: CPF duplicado");
  });

  it("falha na varredura (legado fora do ar) marca o lote como FALHOU com o motivo", async () => {
    const legado = { buscarPessoasPorPrefixoNome: vi.fn().mockRejectedValue(new Error("Sistema legado respondeu 500")), buscarTitulosPorPessoa: vi.fn() };
    await expect(importacaoLegadoLoteService.executar("l1", "u1", legado as never)).rejects.toThrow(/500/);
    expect(lote.atualizar.mock.calls.at(-1)?.[1]).toMatchObject({ status: "FALHOU", mensagemFalha: "Sistema legado respondeu 500" });
  });

  it("respeita o limite de pessoas do lote", async () => {
    lote.findById.mockResolvedValue({ id: "l1", limite: 1 } as never);
    await importacaoLegadoLoteService.executar("l1", "u1", legadoFalso() as never);
    expect((lote.atualizar.mock.calls.at(-1)?.[1] as { pessoasProcessadas: number }).pessoasProcessadas).toBe(1);
  });
});

describe("importacaoLegadoLoteService.iniciar", () => {
  it("cria o lote e enfileira o job", async () => {
    lote.emAndamento.mockResolvedValue(null);
    lote.criar.mockResolvedValue({ id: "l9" } as never);
    await importacaoLegadoLoteService.iniciar("u1");
    expect(importacaoLegadoLoteQueue.add).toHaveBeenCalledWith("importar-lote", { loteId: "l9", usuarioId: "u1" });
  });

  it("recusa iniciar outro enquanto há um em andamento", async () => {
    lote.emAndamento.mockResolvedValue({ id: "l1" } as never);
    await expect(importacaoLegadoLoteService.iniciar("u1")).rejects.toThrow(/em andamento/);
    expect(importacaoLegadoLoteQueue.add).not.toHaveBeenCalled();
  });
});
