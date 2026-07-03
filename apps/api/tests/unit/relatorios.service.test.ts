import { beforeEach, describe, expect, it, vi } from "vitest";
import { relatoriosService } from "../../src/modules/relatorios/relatorios.service";
import { relatoriosRepository } from "../../src/modules/relatorios/relatorios.repository";
import { configuracoesRepository } from "../../src/modules/configuracoes/configuracoes.repository";
import { geracaoWordQueue } from "../../src/jobs/queues/geracao-word.queue";
import { registrarAuditoria } from "../../src/modules/auditoria/auditoria.service";

vi.mock("../../src/modules/relatorios/relatorios.repository", () => ({
  relatoriosRepository: {
    buscarMatriculasComParcelasVencidas: vi.fn(),
    findById: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../../src/modules/configuracoes/configuracoes.repository", () => ({
  configuracoesRepository: { obterOuCriar: vi.fn() },
}));

vi.mock("../../src/jobs/queues/geracao-word.queue", () => ({
  geracaoWordQueue: { add: vi.fn() },
}));

vi.mock("../../src/modules/auditoria/auditoria.service", () => ({
  registrarAuditoria: vi.fn(),
}));

const repo = vi.mocked(relatoriosRepository);
const configuracoes = vi.mocked(configuracoesRepository);
const fila = vi.mocked(geracaoWordQueue);
const auditoria = vi.mocked(registrarAuditoria);

const USUARIO = "usuario-1";

const candidato = (overrides: Partial<Record<string, unknown>> = {}) => ({
  matriculaId: "matricula-1",
  alunoId: "aluno-1",
  alunoNome: "Maria Silva",
  alunoCpf: "39053344705",
  cursoId: "curso-1",
  cursoNome: "Engenharia",
  quantidadeParcelasVencidas: 3,
  diasAtrasoMaximo: 30,
  valorTotal: 300,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  configuracoes.obterOuCriar.mockResolvedValue({
    id: "config-1",
    parcelasMinimas: 3,
    diasAtraso: 0,
    pastaSaidaDocumentos: "./output",
    modeloDocx: "./templates/modelo.docx",
    padraoNomeArquivo: "{NOME}_{CPF}_{CURSO}.docx",
    frequenciaImportacao: "MANUAL",
    multaPercentual: 2,
    jurosDiarioPercentual: 0.033,
    jurosContarDiaGeracao: true,
  } as never);
});

describe("relatoriosService.previaElegiveis", () => {
  it("usa os padrões da Configuracao quando nenhum filtro é informado", async () => {
    repo.buscarMatriculasComParcelasVencidas.mockResolvedValue([
      candidato({ quantidadeParcelasVencidas: 3 }),
      candidato({ matriculaId: "matricula-2", quantidadeParcelasVencidas: 1 }),
    ] as never);

    const resultado = await relatoriosService.previaElegiveis({});

    expect(resultado).toHaveLength(1);
    expect(resultado[0].matriculaId).toBe("matricula-1");
  });

  it("aplica apenas o critério de dias de atraso quando só ele é informado", async () => {
    repo.buscarMatriculasComParcelasVencidas.mockResolvedValue([
      candidato({ matriculaId: "a", quantidadeParcelasVencidas: 1, diasAtrasoMaximo: 45 }),
      candidato({ matriculaId: "b", quantidadeParcelasVencidas: 1, diasAtrasoMaximo: 5 }),
    ] as never);

    const resultado = await relatoriosService.previaElegiveis({
      parcelasMinimas: 0,
      diasAtraso: 30,
    });

    expect(resultado.map((r) => r.matriculaId)).toEqual(["a"]);
  });

  it("exige ambos os critérios (E) quando os dois são informados juntos", async () => {
    repo.buscarMatriculasComParcelasVencidas.mockResolvedValue([
      candidato({ matriculaId: "a", quantidadeParcelasVencidas: 5, diasAtrasoMaximo: 10 }),
      candidato({ matriculaId: "b", quantidadeParcelasVencidas: 5, diasAtrasoMaximo: 40 }),
    ] as never);

    const resultado = await relatoriosService.previaElegiveis({
      parcelasMinimas: 3,
      diasAtraso: 30,
    });

    expect(resultado.map((r) => r.matriculaId)).toEqual(["b"]);
  });

  it("aplica o filtro de valor mínimo quando informado", async () => {
    repo.buscarMatriculasComParcelasVencidas.mockResolvedValue([
      candidato({ matriculaId: "a", valorTotal: 100 }),
      candidato({ matriculaId: "b", valorTotal: 500 }),
    ] as never);

    const resultado = await relatoriosService.previaElegiveis({
      parcelasMinimas: 0,
      valorMinimo: 200,
    });

    expect(resultado.map((r) => r.matriculaId)).toEqual(["b"]);
  });
});

describe("relatoriosService.gerar", () => {
  it("cria o relatório, registra auditoria e enfileira a geração quando há elegíveis", async () => {
    repo.buscarMatriculasComParcelasVencidas.mockResolvedValue([candidato()] as never);
    repo.create.mockResolvedValue({ id: "relatorio-1", totalElegiveis: 1 } as never);

    const resultado = await relatoriosService.gerar({}, USUARIO);

    expect(resultado).toMatchObject({ id: "relatorio-1" });
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ totalElegiveis: 1 }));
    expect(auditoria).toHaveBeenCalledWith(
      expect.objectContaining({ entidade: "RelatorioInadimplencia", acao: "CRIACAO" }),
    );
    expect(fila.add).toHaveBeenCalledWith("gerar-relatorio", { relatorioId: "relatorio-1" });
  });

  it("não enfileira geração quando não há elegíveis", async () => {
    repo.buscarMatriculasComParcelasVencidas.mockResolvedValue([]);
    repo.create.mockResolvedValue({ id: "relatorio-2", totalElegiveis: 0 } as never);

    await relatoriosService.gerar({}, USUARIO);

    expect(fila.add).not.toHaveBeenCalled();
  });

  it("restringe aos matriculaIds selecionados quando informados", async () => {
    repo.buscarMatriculasComParcelasVencidas.mockResolvedValue([
      candidato({ matriculaId: "a" }),
      candidato({ matriculaId: "b" }),
    ] as never);
    repo.create.mockResolvedValue({ id: "relatorio-3", totalElegiveis: 1 } as never);

    await relatoriosService.gerar({ parcelasMinimas: 0, matriculaIds: ["b"] }, USUARIO);

    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ totalElegiveis: 1 }));
  });
});
