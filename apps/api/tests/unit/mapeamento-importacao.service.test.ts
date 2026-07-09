import { beforeEach, describe, expect, it, vi } from "vitest";
import { mapeamentoImportacaoService } from "../../src/modules/mapeamento-importacao/mapeamento-importacao.service";
import { mapeamentoImportacaoRepository } from "../../src/modules/mapeamento-importacao/mapeamento-importacao.repository";
import { registrarAuditoria } from "../../src/modules/auditoria/auditoria.service";
import { ConflictError, NotFoundError, ValidationError } from "../../src/shared/errors/app-error";

vi.mock("../../src/modules/mapeamento-importacao/mapeamento-importacao.repository", () => ({
  mapeamentoImportacaoRepository: {
    findById: vi.fn(),
    findByColuna: vi.fn(),
    listarOuSemear: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../../src/modules/auditoria/auditoria.service", () => ({
  registrarAuditoria: vi.fn(),
}));

const repo = vi.mocked(mapeamentoImportacaoRepository);
const auditoria = vi.mocked(registrarAuditoria);

const USUARIO = "usuario-1";

const mapeamentoFake = {
  id: "map-1",
  colunaPlanilha: "CIDADE",
  tabelaDestino: "ALUNO" as const,
  campoDestino: "cidade",
  acaoAusente: "NAO_IMPORTAR" as const,
  valorPadrao: null,
  ativo: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("mapeamentoImportacaoService.criar", () => {
  it("cria quando a coluna ainda não tem mapeamento", async () => {
    repo.findByColuna.mockResolvedValue(null);
    repo.create.mockResolvedValue(mapeamentoFake as never);

    const resultado = await mapeamentoImportacaoService.criar(
      {
        colunaPlanilha: "CIDADE",
        tabelaDestino: "ALUNO",
        campoDestino: "cidade",
        acaoAusente: "NAO_IMPORTAR",
      },
      USUARIO,
    );

    expect(resultado).toBe(mapeamentoFake);
    expect(auditoria).toHaveBeenCalledWith(
      expect.objectContaining({ entidade: "MapeamentoImportacao", acao: "CRIACAO" }),
    );
  });

  it("rejeita quando já existe mapeamento para a coluna", async () => {
    repo.findByColuna.mockResolvedValue(mapeamentoFake as never);

    await expect(
      mapeamentoImportacaoService.criar(
        {
          colunaPlanilha: "CIDADE",
          tabelaDestino: "ALUNO",
          campoDestino: "cidade",
          acaoAusente: "NAO_IMPORTAR",
        },
        USUARIO,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(repo.create).not.toHaveBeenCalled();
  });
});

describe("mapeamentoImportacaoService.atualizar", () => {
  it("lança NotFound quando o mapeamento não existe", async () => {
    repo.findById.mockResolvedValue(null);

    await expect(
      mapeamentoImportacaoService.atualizar("map-x", { ativo: false }, USUARIO),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejeita campo de destino desconhecido para a tabela", async () => {
    repo.findById.mockResolvedValue(mapeamentoFake as never);

    await expect(
      mapeamentoImportacaoService.atualizar("map-1", { campoDestino: "campoInexistente" }, USUARIO),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("limpa valorPadrao quando a ação muda para NAO_IMPORTAR", async () => {
    repo.findById.mockResolvedValue({
      ...mapeamentoFake,
      acaoAusente: "VALOR_PADRAO",
      valorPadrao: "SP",
    } as never);
    repo.update.mockResolvedValue(mapeamentoFake as never);

    await mapeamentoImportacaoService.atualizar("map-1", { acaoAusente: "NAO_IMPORTAR" }, USUARIO);

    expect(repo.update).toHaveBeenCalledWith(
      "map-1",
      expect.objectContaining({ acaoAusente: "NAO_IMPORTAR", valorPadrao: null }),
    );
  });
});

describe("mapeamentoImportacaoService.remover", () => {
  it("lança NotFound quando o mapeamento não existe", async () => {
    repo.findById.mockResolvedValue(null);
    await expect(mapeamentoImportacaoService.remover("map-x", USUARIO)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("remove e registra auditoria", async () => {
    repo.findById.mockResolvedValue(mapeamentoFake as never);

    await mapeamentoImportacaoService.remover("map-1", USUARIO);

    expect(repo.delete).toHaveBeenCalledWith("map-1");
    expect(auditoria).toHaveBeenCalledWith(
      expect.objectContaining({ entidade: "MapeamentoImportacao", acao: "EXCLUSAO" }),
    );
  });
});
