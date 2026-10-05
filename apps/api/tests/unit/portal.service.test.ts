import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_SECRET = "segredo-de-teste";

import { portalService, limparLimitesLogin } from "../../src/modules/portal/portal.service";
import { portalRepository } from "../../src/modules/portal/portal.repository";
import { asaasService } from "../../src/modules/asaas/asaas.service";
import { documentosService } from "../../src/modules/documentos/documentos.service";
import { AppError, NotFoundError, ValidationError } from "../../src/shared/errors/app-error";
import { verificarTokenAluno } from "../../src/shared/utils/jwt";

vi.mock("../../src/modules/portal/portal.repository", () => ({
  portalRepository: {
    findAlunoPorCpf: vi.fn(),
    findAluno: vi.fn(),
    listarMatriculas: vi.fn(),
    findMatriculaDoAluno: vi.fn(),
    listarParcelas: vi.fn(),
    findParcelaDoAluno: vi.fn(),
    findDocumentoDoAluno: vi.fn(),
  },
}));
vi.mock("../../src/modules/asaas/asaas.service", () => ({
  asaasService: { gerarCobrancaParcela: vi.fn() },
}));
vi.mock("../../src/modules/documentos/documentos.service", () => ({
  documentosService: { listarDaMatricula: vi.fn(), anexarArquivo: vi.fn(), obterArquivo: vi.fn() },
}));
vi.mock("../../src/modules/solicitacoes/solicitacoes.service", () => ({ solicitacoesService: {} }));

const repo = vi.mocked(portalRepository);
const asaas = vi.mocked(asaasService);
const docs = vi.mocked(documentosService);

const aluno = {
  id: "a1",
  codigo: "202600001",
  nome: "Maria",
  dataNascimento: new Date("1990-05-17T00:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  limparLimitesLogin();
});

describe("portalService.login", () => {
  it("entra com CPF (com máscara) e data de nascimento corretos", async () => {
    repo.findAlunoPorCpf.mockResolvedValue(aluno as never);
    const r = await portalService.login({ cpf: "529.982.247-25", dataNascimento: "1990-05-17" }, "ip");
    expect(repo.findAlunoPorCpf).toHaveBeenCalledWith("52998224725");
    expect(verificarTokenAluno(r.token)?.sub).toBe("a1");
  });

  it("recusa data errada com mensagem genérica", async () => {
    repo.findAlunoPorCpf.mockResolvedValue(aluno as never);
    await expect(
      portalService.login({ cpf: "52998224725", dataNascimento: "1990-05-18" }, "ip"),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("recusa aluno sem data de nascimento cadastrada", async () => {
    repo.findAlunoPorCpf.mockResolvedValue({ ...aluno, dataNascimento: null } as never);
    await expect(
      portalService.login({ cpf: "52998224725", dataNascimento: "1990-05-17" }, "ip"),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("bloqueia o CPF após 5 falhas, mesmo com a data certa", async () => {
    repo.findAlunoPorCpf.mockResolvedValue(aluno as never);
    for (let i = 0; i < 5; i++) {
      await portalService
        .login({ cpf: "52998224725", dataNascimento: "2000-01-01" }, "ip")
        .catch(() => undefined);
    }
    await expect(
      portalService.login({ cpf: "52998224725", dataNascimento: "1990-05-17" }, "ip"),
    ).rejects.toMatchObject({ statusCode: 429 });
  });
});

describe("portalService — isolamento entre alunos", () => {
  it("não lista documentos de matrícula de outro aluno", async () => {
    repo.findMatriculaDoAluno.mockResolvedValue(null);
    await expect(portalService.listarDocumentos("a1", "m-de-outro")).rejects.toBeInstanceOf(NotFoundError);
    expect(docs.listarDaMatricula).not.toHaveBeenCalled();
  });

  it("não emite cobrança de parcela de outro aluno", async () => {
    repo.findParcelaDoAluno.mockResolvedValue(null);
    await expect(portalService.gerarCobranca("a1", "p-de-outro")).rejects.toBeInstanceOf(NotFoundError);
    expect(asaas.gerarCobrancaParcela).not.toHaveBeenCalled();
  });

  it("não baixa documento de outro aluno", async () => {
    repo.findDocumentoDoAluno.mockResolvedValue(null);
    await expect(portalService.baixarDocumento("a1", "d1")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("portalService.gerarCobranca", () => {
  it("só para parcela em aberto", async () => {
    repo.findParcelaDoAluno.mockResolvedValue({ id: "p1", status: "PAGO", formaPagamento: null } as never);
    await expect(portalService.gerarCobranca("a1", "p1")).rejects.toBeInstanceOf(ValidationError);
  });

  it("usa a forma definida na parcela e não registra usuário do sistema", async () => {
    repo.findParcelaDoAluno.mockResolvedValue({ id: "p1", status: "EM_ABERTO", formaPagamento: "PIX" } as never);
    await portalService.gerarCobranca("a1", "p1");
    expect(asaas.gerarCobrancaParcela).toHaveBeenCalledWith("p1", "PIX", null);
  });

  it("forma escolhida pelo aluno prevalece; padrão é boleto", async () => {
    repo.findParcelaDoAluno.mockResolvedValue({ id: "p1", status: "EM_ABERTO", formaPagamento: null } as never);
    await portalService.gerarCobranca("a1", "p1");
    expect(asaas.gerarCobrancaParcela).toHaveBeenLastCalledWith("p1", "BOLETO", null);
    await portalService.gerarCobranca("a1", "p1", "CREDIT_CARD");
    expect(asaas.gerarCobrancaParcela).toHaveBeenLastCalledWith("p1", "CREDIT_CARD", null);
  });
});

describe("portalService.enviarDocumento", () => {
  const arquivo = { originalname: "cpf.pdf", mimetype: "application/pdf", size: 1, buffer: Buffer.from("x") };

  it("não substitui documento já deferido", async () => {
    repo.findMatriculaDoAluno.mockResolvedValue({ id: "m1" } as never);
    docs.listarDaMatricula.mockResolvedValue({
      itens: [{ tipo: { id: "t1" }, documento: { situacaoDeferimento: "DEFERIDO" } }],
    } as never);
    await expect(portalService.enviarDocumento("a1", "m1", "t1", arquivo)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(docs.anexarArquivo).not.toHaveBeenCalled();
  });

  it("anexa sem usuário do sistema (envio do próprio aluno)", async () => {
    repo.findMatriculaDoAluno.mockResolvedValue({ id: "m1" } as never);
    docs.listarDaMatricula.mockResolvedValue({
      itens: [{ tipo: { id: "t1" }, documento: null }],
    } as never);
    docs.anexarArquivo.mockResolvedValue({ id: "d1", situacaoEntrega: "ENVIADO", situacaoDeferimento: "PENDENTE" } as never);
    await portalService.enviarDocumento("a1", "m1", "t1", arquivo, "200.1.2.3");
    expect(docs.anexarArquivo).toHaveBeenCalledWith("m1", "t1", arquivo, null, "200.1.2.3");
  });

  it("listarDocumentos não expõe observação interna", async () => {
    repo.findMatriculaDoAluno.mockResolvedValue({ id: "m1" } as never);
    docs.listarDaMatricula.mockResolvedValue({
      pendentesObrigatorios: 1,
      itens: [
        {
          tipo: { id: "t1", nome: "CPF", escopo: "ALUNO", obrigatorio: true, ordem: 1 },
          documento: { id: "d1", observacaoInterna: "segredo", situacaoEntrega: "ENVIADO", situacaoDeferimento: "PENDENTE" },
        },
      ],
    } as never);
    const r = await portalService.listarDocumentos("a1", "m1");
    expect(JSON.stringify(r)).not.toContain("segredo");
  });
});
