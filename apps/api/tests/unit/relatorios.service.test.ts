import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { relatoriosService } from "../../src/modules/relatorios/relatorios.service";
import { relatoriosRepository } from "../../src/modules/relatorios/relatorios.repository";
import { configuracoesRepository } from "../../src/modules/configuracoes/configuracoes.repository";
import { geracaoWordQueue } from "../../src/jobs/queues/geracao-word.queue";
import { registrarAuditoria } from "../../src/modules/auditoria/auditoria.service";
import { NotFoundError } from "../../src/shared/errors/app-error";

vi.mock("../../src/modules/relatorios/relatorios.repository", () => ({
  relatoriosRepository: {
    buscarMatriculasComParcelasVencidas: vi.fn(),
    findById: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    buscarUltimoDocumentoGeradoPorMatricula: vi.fn(),
  },
}));

vi.mock("node:fs", () => ({
  default: { unlinkSync: vi.fn() },
}));

vi.mock("../../src/modules/configuracoes/configuracoes.repository", () => ({
  configuracoesRepository: { obterOuCriar: vi.fn() },
}));

vi.mock("../../src/jobs/queues/geracao-word.queue", () => ({
  geracaoWordQueue: { add: vi.fn(), getJob: vi.fn() },
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
  it("não filtra por atraso quando nenhum filtro é informado e a Configuracao está em 0", async () => {
    repo.buscarMatriculasComParcelasVencidas.mockResolvedValue([
      candidato({ diasAtrasoMaximo: 1 }),
      candidato({ matriculaId: "matricula-2", diasAtrasoMaximo: 45 }),
    ] as never);

    const resultado = await relatoriosService.previaElegiveis({});

    expect(resultado).toHaveLength(2);
  });

  it("usa o padrão de dias de atraso da Configuracao quando o filtro não é informado", async () => {
    configuracoes.obterOuCriar.mockResolvedValue({
      id: "config-1",
      diasAtraso: 90,
      pastaSaidaDocumentos: "./output",
      modeloDocx: "./templates/modelo.docx",
      padraoNomeArquivo: "{NOME}_{CPF}_{CURSO}.docx",
      frequenciaImportacao: "MANUAL",
      multaPercentual: 2,
      jurosDiarioPercentual: 0.033,
      jurosContarDiaGeracao: true,
    } as never);
    repo.buscarMatriculasComParcelasVencidas.mockResolvedValue([
      candidato({ matriculaId: "a", diasAtrasoMaximo: 120 }),
      candidato({ matriculaId: "b", diasAtrasoMaximo: 10 }),
    ] as never);

    const resultado = await relatoriosService.previaElegiveis({});

    expect(resultado.map((r) => r.matriculaId)).toEqual(["a"]);
  });

  it("aplica o filtro de dias de atraso quando informado explicitamente", async () => {
    repo.buscarMatriculasComParcelasVencidas.mockResolvedValue([
      candidato({ matriculaId: "a", diasAtrasoMaximo: 45 }),
      candidato({ matriculaId: "b", diasAtrasoMaximo: 5 }),
    ] as never);

    const resultado = await relatoriosService.previaElegiveis({ diasAtraso: 30 });

    expect(resultado.map((r) => r.matriculaId)).toEqual(["a"]);
  });

  it("aplica o filtro de valor mínimo quando informado", async () => {
    repo.buscarMatriculasComParcelasVencidas.mockResolvedValue([
      candidato({ matriculaId: "a", valorTotal: 100 }),
      candidato({ matriculaId: "b", valorTotal: 500 }),
    ] as never);

    const resultado = await relatoriosService.previaElegiveis({ valorMinimo: 200 });

    expect(resultado.map((r) => r.matriculaId)).toEqual(["b"]);
  });
});

describe("relatoriosService.gerar", () => {
  it("cria o relatório, registra auditoria e enfileira a geração quando há elegíveis", async () => {
    repo.buscarMatriculasComParcelasVencidas.mockResolvedValue([candidato()] as never);
    repo.create.mockResolvedValue({ id: "relatorio-1", totalElegiveis: 1 } as never);
    fila.add.mockResolvedValue({ id: "job-1" } as never);

    const resultado = await relatoriosService.gerar({}, USUARIO);

    expect(resultado).toMatchObject({ id: "relatorio-1", jobId: "job-1" });
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

    await relatoriosService.gerar({ matriculaIds: ["b"] }, USUARIO);

    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ totalElegiveis: 1 }));
  });

  it("persiste incluirParcelasVencidasRecentes no relatório criado, para o worker usar na geração", async () => {
    repo.buscarMatriculasComParcelasVencidas.mockResolvedValue([candidato()] as never);
    repo.create.mockResolvedValue({ id: "relatorio-4", totalElegiveis: 1 } as never);

    await relatoriosService.gerar({ incluirParcelasVencidasRecentes: true }, USUARIO);

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ incluirParcelasVencidasRecentes: true }),
    );
  });

  it("persiste incluirParcelasVencidasRecentes como false quando explicitamente informado", async () => {
    repo.buscarMatriculasComParcelasVencidas.mockResolvedValue([candidato()] as never);
    repo.create.mockResolvedValue({ id: "relatorio-5", totalElegiveis: 1 } as never);

    await relatoriosService.gerar({ incluirParcelasVencidasRecentes: false }, USUARIO);

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ incluirParcelasVencidasRecentes: false }),
    );
  });
});

describe("relatoriosService.statusJob", () => {
  it("lança NotFound quando o job não existe na fila", async () => {
    fila.getJob.mockResolvedValue(undefined);
    await expect(relatoriosService.statusJob("job-x")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("retorna estado e progresso do job", async () => {
    fila.getJob.mockResolvedValue({
      id: "job-1",
      progress: 50,
      getState: vi.fn().mockResolvedValue("active"),
    } as never);

    const status = await relatoriosService.statusJob("job-1");

    expect(status).toMatchObject({ jobId: "job-1", estado: "active", progresso: 50 });
  });
});

describe("relatoriosService.buscarUltimoDocumentoGeradoPorMatricula", () => {
  it("repassa o resultado do repository (null quando nunca foi gerado)", async () => {
    repo.buscarUltimoDocumentoGeradoPorMatricula.mockResolvedValue(null);

    const resultado = await relatoriosService.buscarUltimoDocumentoGeradoPorMatricula("matricula-1");

    expect(resultado).toBeNull();
    expect(repo.buscarUltimoDocumentoGeradoPorMatricula).toHaveBeenCalledWith("matricula-1");
  });

  it("repassa o documento encontrado", async () => {
    repo.buscarUltimoDocumentoGeradoPorMatricula.mockResolvedValue({
      relatorioId: "relatorio-9",
      temDocx: true,
      temPdf: true,
    });

    const resultado = await relatoriosService.buscarUltimoDocumentoGeradoPorMatricula("matricula-1");

    expect(resultado).toEqual({ relatorioId: "relatorio-9", temDocx: true, temPdf: true });
  });
});

describe("relatoriosService.excluir", () => {
  const fsMock = vi.mocked(fs);

  it("apaga os arquivos gerados, exclui o registro e registra auditoria", async () => {
    repo.findById.mockResolvedValue({
      id: "relatorio-1",
      totalDocumentosGerados: 2,
      itens: [
        { caminhoDocumento: "output/a.docx", caminhoDocumentoPdf: "output/a.pdf" },
        { caminhoDocumento: "output/b.docx", caminhoDocumentoPdf: null },
      ],
    } as never);

    await relatoriosService.excluir("relatorio-1", USUARIO);

    expect(fsMock.unlinkSync).toHaveBeenCalledTimes(3);
    expect(repo.delete).toHaveBeenCalledWith("relatorio-1");
    expect(auditoria).toHaveBeenCalledWith(
      expect.objectContaining({
        entidade: "RelatorioInadimplencia",
        entidadeId: "relatorio-1",
        acao: "EXCLUSAO",
      }),
    );
  });

  it("exclui o registro mesmo se um arquivo já não existir em disco", async () => {
    repo.findById.mockResolvedValue({
      id: "relatorio-2",
      totalDocumentosGerados: 1,
      itens: [{ caminhoDocumento: "output/inexistente.docx" }],
    } as never);
    fsMock.unlinkSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    await relatoriosService.excluir("relatorio-2", USUARIO);

    expect(repo.delete).toHaveBeenCalledWith("relatorio-2");
  });

  it("lança NotFound quando o relatório não existe", async () => {
    repo.findById.mockResolvedValue(null);

    await expect(relatoriosService.excluir("x", USUARIO)).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.delete).not.toHaveBeenCalled();
  });
});
