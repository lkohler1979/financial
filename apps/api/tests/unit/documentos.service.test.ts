import { beforeEach, describe, expect, it, vi } from "vitest";
import { documentosService } from "../../src/modules/documentos/documentos.service";
import { documentosRepository } from "../../src/modules/documentos/documentos.repository";
import { ValidationError } from "../../src/shared/errors/app-error";

vi.mock("../../src/modules/documentos/documentos.repository", () => ({
  documentosRepository: {
    listarTiposAtivos: vi.fn(),
    findTipo: vi.fn(),
    findMatricula: vi.fn(),
    listarDaMatricula: vi.fn(),
    findById: vi.fn(),
    findPorTipo: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findUsuario: vi.fn(),
  },
}));
vi.mock("../../src/modules/auditoria/auditoria.service", () => ({ registrarAuditoria: vi.fn() }));
vi.mock("../../src/shared/armazenamento/armazenamento", () => ({
  armazenamento: {
    salvar: vi.fn().mockResolvedValue("aluno-1/arquivo.pdf"),
    remover: vi.fn(),
    caminho: vi.fn(),
  },
}));

const repo = vi.mocked(documentosRepository);
const tipoCpf = { id: "t-cpf", nome: "CPF", escopo: "ALUNO", obrigatorio: true, ativo: true };
const tipoContrato = {
  id: "t-contrato",
  nome: "Contrato",
  escopo: "MATRICULA",
  obrigatorio: true,
  ativo: true,
};
const docBase = {
  id: "d1",
  alunoId: "aluno-1",
  tipoDocumentoId: "t-cpf",
  matriculaId: null,
  situacaoEntrega: "ENVIADO",
  situacaoDeferimento: "PENDENTE",
  arquivoChave: null,
  tipo: tipoCpf,
};
const usuarioSemPermissao = { id: "u", perfil: "USUARIO", podeDeferirDocumentos: false };
const usuarioComPermissao = { id: "u", perfil: "USUARIO", podeDeferirDocumentos: true };
const admin = { id: "a", perfil: "ADMINISTRADOR", podeDeferirDocumentos: false };

beforeEach(() => {
  vi.clearAllMocks();
  repo.findMatricula.mockResolvedValue({ id: "m1", alunoId: "aluno-1" } as never);
  repo.findTipo.mockResolvedValue(tipoCpf as never);
  repo.findPorTipo.mockResolvedValue(docBase as never);
  repo.update.mockResolvedValue(docBase as never);
});

describe("documentosService.atualizar — deferimento", () => {
  it("recusa deferir sem permissão", async () => {
    repo.findUsuario.mockResolvedValue(usuarioSemPermissao as never);
    await expect(
      documentosService.atualizar("m1", "t-cpf", { situacaoDeferimento: "DEFERIDO" }, "u"),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("permite deferir com a permissão e registra quem validou", async () => {
    repo.findUsuario.mockResolvedValue(usuarioComPermissao as never);
    await documentosService.atualizar("m1", "t-cpf", { situacaoDeferimento: "DEFERIDO" }, "u");
    expect(repo.update).toHaveBeenCalledWith(
      "d1",
      expect.objectContaining({ situacaoDeferimento: "DEFERIDO", validadoPorId: "u" }),
    );
  });

  it("administrador sempre pode deferir", async () => {
    repo.findUsuario.mockResolvedValue(admin as never);
    await documentosService.atualizar("m1", "t-cpf", { situacaoDeferimento: "INDEFERIDO" }, "a");
    expect(repo.update).toHaveBeenCalled();
  });

  it("não deixa deferir documento ainda não enviado", async () => {
    repo.findUsuario.mockResolvedValue(admin as never);
    repo.findPorTipo.mockResolvedValue({ ...docBase, situacaoEntrega: "NAO_ENVIADO" } as never);
    await expect(
      documentosService.atualizar("m1", "t-cpf", { situacaoDeferimento: "DEFERIDO" }, "a"),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("voltar a entrega para NAO_ENVIADO zera um deferimento anterior", async () => {
    repo.findPorTipo.mockResolvedValue({ ...docBase, situacaoDeferimento: "DEFERIDO" } as never);
    await documentosService.atualizar("m1", "t-cpf", { situacaoEntrega: "NAO_ENVIADO" }, "u");
    expect(repo.update).toHaveBeenCalledWith(
      "d1",
      expect.objectContaining({
        situacaoEntrega: "NAO_ENVIADO",
        situacaoDeferimento: "PENDENTE",
        validadoPorId: null,
      }),
    );
  });

  it("editar só observações não exige permissão de deferir", async () => {
    await documentosService.atualizar("m1", "t-cpf", { observacaoInterna: "ok" }, "u");
    expect(repo.findUsuario).not.toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalled();
  });
});

describe("documentosService.anexarArquivo", () => {
  it("rejeita formato inválido", async () => {
    await expect(
      documentosService.anexarArquivo(
        "m1",
        "t-cpf",
        { originalname: "x.exe", mimetype: "a", size: 1, buffer: Buffer.from("") },
        "u",
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("marca ENVIADO e volta o deferimento para PENDENTE", async () => {
    await documentosService.anexarArquivo(
      "m1",
      "t-cpf",
      { originalname: "cpf.pdf", mimetype: "application/pdf", size: 10, buffer: Buffer.from("x") },
      "u",
    );
    expect(repo.update).toHaveBeenCalledWith(
      "d1",
      expect.objectContaining({
        situacaoEntrega: "ENVIADO",
        situacaoDeferimento: "PENDENTE",
        arquivoNome: "cpf.pdf",
      }),
    );
  });
});

describe("documentosService.listarDaMatricula", () => {
  it("monta um item por tipo e conta obrigatórios pendentes", async () => {
    repo.listarTiposAtivos.mockResolvedValue([tipoCpf, tipoContrato] as never);
    repo.listarDaMatricula.mockResolvedValue([
      { ...docBase, situacaoDeferimento: "DEFERIDO" },
    ] as never);
    repo.findUsuario.mockResolvedValue(usuarioSemPermissao as never);

    const r = await documentosService.listarDaMatricula("m1", "u");

    expect(r.itens).toHaveLength(2);
    expect(r.itens[0].documento?.id).toBe("d1");
    expect(r.itens[1].documento).toBeNull();
    expect(r.pendentesObrigatorios).toBe(1);
    expect(r.podeDeferir).toBe(false);
  });
});
