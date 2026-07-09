import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { configuracoesService } from "../../src/modules/configuracoes/configuracoes.service";
import { configuracoesRepository } from "../../src/modules/configuracoes/configuracoes.repository";
import { registrarAuditoria } from "../../src/modules/auditoria/auditoria.service";

vi.mock("../../src/modules/configuracoes/configuracoes.repository", () => ({
  configuracoesRepository: {
    obterOuCriar: vi.fn(),
    atualizar: vi.fn(),
    limparDadosTransacionais: vi.fn(),
  },
}));

vi.mock("../../src/modules/auditoria/auditoria.service", () => ({
  registrarAuditoria: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: { unlinkSync: vi.fn() },
}));

const repo = vi.mocked(configuracoesRepository);
const auditoria = vi.mocked(registrarAuditoria);

const USUARIO = "usuario-1";

const configuracaoFake = {
  id: "config-1",
  diasAtraso: 15,
  pastaSaidaDocumentos: "./output",
  modeloDocx: "./templates/modelo.docx",
  padraoNomeArquivo: "{NOME}_{CPF}_{CURSO}.docx",
  frequenciaImportacao: "SEMANAL",
  multaPercentual: 2,
  jurosDiarioPercentual: 0.033,
  jurosContarDiaGeracao: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  repo.obterOuCriar.mockResolvedValue(configuracaoFake as never);
  repo.atualizar.mockResolvedValue({ ...configuracaoFake, diasAtraso: 90 } as never);
});

describe("configuracoesService.obter", () => {
  it("retorna o singleton de configuração serializado para a API", async () => {
    const resultado = await configuracoesService.obter();

    expect(resultado).toMatchObject({
      id: "config-1",
      diasAtraso: 15,
      multaPercentual: 2,
      jurosDiarioPercentual: 0.033,
    });
  });
});

describe("configuracoesService.atualizar", () => {
  it("atualiza os campos informados e registra auditoria", async () => {
    const resultado = await configuracoesService.atualizar({ diasAtraso: 90 }, USUARIO);

    expect(resultado.diasAtraso).toBe(90);
    expect(repo.atualizar).toHaveBeenCalledWith({ diasAtraso: 90 });
    expect(auditoria).toHaveBeenCalledWith(
      expect.objectContaining({
        usuarioId: USUARIO,
        entidade: "Configuracao",
        entidadeId: "config-1",
        acao: "ATUALIZACAO",
        detalhes: { camposAlterados: ["diasAtraso"] },
      }),
    );
  });
});

describe("configuracoesService.limparBase", () => {
  const fsMock = vi.mocked(fs);
  const contagensFake = {
    historicoCobranca: 3,
    observacoesCobranca: 2,
    matriculaTags: 1,
    parcelas: 10,
    matriculas: 5,
    relatoriosInadimplencia: 2,
    importacoes: 1,
    alunos: 4,
    cursos: 2,
  };

  it("apaga os arquivos dos relatórios, delega ao repository e registra auditoria", async () => {
    repo.limparDadosTransacionais.mockResolvedValue({
      relatoriosAntesDaExclusao: [
        { itens: [{ caminhoDocumento: "output/a.docx", caminhoDocumentoPdf: "output/a.pdf" }] },
      ],
      contagens: contagensFake,
    } as never);

    const resultado = await configuracoesService.limparBase(USUARIO);

    expect(resultado).toEqual(contagensFake);
    expect(fsMock.unlinkSync).toHaveBeenCalledTimes(2);
    expect(auditoria).toHaveBeenCalledWith(
      expect.objectContaining({
        usuarioId: USUARIO,
        entidade: "BaseDados",
        acao: "EXCLUSAO",
        detalhes: contagensFake,
      }),
    );
  });

  it("conclui mesmo se um arquivo já não existir em disco", async () => {
    repo.limparDadosTransacionais.mockResolvedValue({
      relatoriosAntesDaExclusao: [{ itens: [{ caminhoDocumento: "output/inexistente.docx" }] }],
      contagens: contagensFake,
    } as never);
    fsMock.unlinkSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    await expect(configuracoesService.limparBase(USUARIO)).resolves.toEqual(contagensFake);
  });
});
