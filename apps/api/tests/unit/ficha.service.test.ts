import { beforeEach, describe, expect, it, vi } from "vitest";
import { fichaService } from "../../src/modules/cobranca/ficha.service";
import { matriculasRepository } from "../../src/modules/matriculas/matriculas.repository";
import { situacoesRepository } from "../../src/modules/cobranca/situacoes.repository";
import { tagsRepository } from "../../src/modules/cobranca/tags.repository";
import { historicoRepository } from "../../src/modules/cobranca/historico.repository";
import { observacoesRepository } from "../../src/modules/cobranca/observacoes.repository";
import { ConflictError, NotFoundError } from "../../src/shared/errors/app-error";

vi.mock("../../src/modules/matriculas/matriculas.repository", () => ({
  matriculasRepository: { findById: vi.fn(), update: vi.fn() },
}));
vi.mock("../../src/modules/cobranca/situacoes.repository", () => ({
  situacoesRepository: { findById: vi.fn() },
}));
vi.mock("../../src/modules/cobranca/tags.repository", () => ({
  tagsRepository: {
    findById: vi.fn(),
    findAssociacao: vi.fn(),
    associar: vi.fn(),
    desassociar: vi.fn(),
    listarTagsDaMatricula: vi.fn(),
  },
}));
vi.mock("../../src/modules/cobranca/historico.repository", () => ({
  historicoRepository: { registrar: vi.fn(), listarPorMatricula: vi.fn() },
}));
vi.mock("../../src/modules/cobranca/observacoes.repository", () => ({
  observacoesRepository: { criar: vi.fn(), listarPorMatricula: vi.fn() },
}));

const matriculas = vi.mocked(matriculasRepository);
const situacoes = vi.mocked(situacoesRepository);
const tags = vi.mocked(tagsRepository);
const historico = vi.mocked(historicoRepository);
const observacoes = vi.mocked(observacoesRepository);

const MATRICULA_ID = "matricula-1";
const USUARIO = "usuario-1";

beforeEach(() => {
  vi.clearAllMocks();
  matriculas.findById.mockResolvedValue({ id: MATRICULA_ID } as never);
});

describe("fichaService.mudarSituacao", () => {
  it("atualiza a matrícula e registra histórico", async () => {
    situacoes.findById.mockResolvedValue({ id: "sit-1", nome: "Em contato" } as never);
    matriculas.update.mockResolvedValue({ id: MATRICULA_ID } as never);

    await fichaService.mudarSituacao(MATRICULA_ID, "sit-1", USUARIO);

    expect(matriculas.update).toHaveBeenCalledWith(
      MATRICULA_ID,
      expect.objectContaining({ situacaoCobranca: { connect: { id: "sit-1" } } }),
    );
    expect(historico.registrar).toHaveBeenCalledWith(
      MATRICULA_ID,
      USUARIO,
      expect.stringContaining("Em contato"),
    );
  });

  it("lança NotFound quando a situação não existe", async () => {
    situacoes.findById.mockResolvedValue(null);
    await expect(fichaService.mudarSituacao(MATRICULA_ID, "sit-x", USUARIO)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("fichaService.adicionarTag", () => {
  it("associa a tag e registra histórico", async () => {
    tags.findById.mockResolvedValue({ id: "tag-1", nome: "WhatsApp" } as never);
    tags.findAssociacao.mockResolvedValue(null);

    await fichaService.adicionarTag(MATRICULA_ID, "tag-1", USUARIO);

    expect(tags.associar).toHaveBeenCalledWith(MATRICULA_ID, "tag-1");
    expect(historico.registrar).toHaveBeenCalledWith(
      MATRICULA_ID,
      USUARIO,
      expect.stringContaining("WhatsApp"),
    );
  });

  it("rejeita quando a matrícula já tem a tag", async () => {
    tags.findById.mockResolvedValue({ id: "tag-1", nome: "WhatsApp" } as never);
    tags.findAssociacao.mockResolvedValue({ matriculaId: MATRICULA_ID, tagId: "tag-1" } as never);

    await expect(fichaService.adicionarTag(MATRICULA_ID, "tag-1", USUARIO)).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(tags.associar).not.toHaveBeenCalled();
  });
});

describe("fichaService.removerTag", () => {
  it("lança NotFound quando a matrícula não tem a tag", async () => {
    tags.findById.mockResolvedValue({ id: "tag-1", nome: "WhatsApp" } as never);
    tags.findAssociacao.mockResolvedValue(null);

    await expect(fichaService.removerTag(MATRICULA_ID, "tag-1", USUARIO)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("fichaService.adicionarObservacao", () => {
  it("cria a observação e registra histórico", async () => {
    observacoes.criar.mockResolvedValue({ id: "obs-1", texto: "Ligação realizada" } as never);

    const resultado = await fichaService.adicionarObservacao(
      MATRICULA_ID,
      "Ligação realizada",
      USUARIO,
    );

    expect(resultado).toMatchObject({ texto: "Ligação realizada" });
    expect(historico.registrar).toHaveBeenCalledWith(
      MATRICULA_ID,
      USUARIO,
      "Observação adicionada",
    );
  });
});

describe("fichaService.obterFicha", () => {
  it("lança NotFound quando a matrícula não existe", async () => {
    matriculas.findById.mockResolvedValue(null);
    await expect(fichaService.obterFicha("x")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("fichaService.aplicarEmLote", () => {
  it("aplica situação, tag e observação para todas as matrículas selecionadas", async () => {
    situacoes.findById.mockResolvedValue({ id: "sit-1", nome: "Em contato" } as never);
    tags.findById.mockResolvedValue({ id: "tag-1", nome: "WhatsApp" } as never);
    tags.findAssociacao.mockResolvedValue(null);
    matriculas.update.mockResolvedValue({} as never);
    observacoes.criar.mockResolvedValue({ id: "obs-1" } as never);

    const resultado = await fichaService.aplicarEmLote(
      {
        matriculaIds: ["a", "b"],
        situacaoCobrancaId: "sit-1",
        tagIds: ["tag-1"],
        observacao: "Contato em lote",
      },
      USUARIO,
    );

    expect(resultado).toEqual({ total: 2, sucesso: 2, erros: [] });
    expect(matriculas.update).toHaveBeenCalledTimes(2);
    expect(tags.associar).toHaveBeenCalledTimes(2);
    expect(observacoes.criar).toHaveBeenCalledTimes(2);
  });

  it("continua processando as demais matrículas quando uma falha", async () => {
    matriculas.findById.mockImplementation((id: string) =>
      Promise.resolve(id === "falha" ? null : ({ id } as never)),
    );
    situacoes.findById.mockResolvedValue({ id: "sit-1", nome: "Em contato" } as never);
    matriculas.update.mockResolvedValue({} as never);

    const resultado = await fichaService.aplicarEmLote(
      { matriculaIds: ["falha", "ok"], situacaoCobrancaId: "sit-1" },
      USUARIO,
    );

    expect(resultado.total).toBe(2);
    expect(resultado.sucesso).toBe(1);
    expect(resultado.erros).toHaveLength(1);
    expect(resultado.erros[0].matriculaId).toBe("falha");
  });

  it("não faz nada além de contar sucesso quando nenhum campo é informado", async () => {
    const resultado = await fichaService.aplicarEmLote({ matriculaIds: ["a"] }, USUARIO);
    expect(resultado).toEqual({ total: 1, sucesso: 1, erros: [] });
  });
});
