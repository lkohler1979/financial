import { beforeEach, describe, expect, it, vi } from "vitest";
import { usuariosService } from "../../src/modules/usuarios/usuarios.service";
import { usuariosRepository } from "../../src/modules/usuarios/usuarios.repository";
import { registrarAuditoria } from "../../src/modules/auditoria/auditoria.service";
import { ConflictError, NotFoundError } from "../../src/shared/errors/app-error";

vi.mock("../../src/modules/usuarios/usuarios.repository", () => ({
  usuariosRepository: {
    findByEmail: vi.fn(),
    findByIdSeguro: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../../src/modules/auditoria/auditoria.service", () => ({
  registrarAuditoria: vi.fn(),
}));

const repo = vi.mocked(usuariosRepository);
const auditoria = vi.mocked(registrarAuditoria);

const usuarioFake = {
  id: "usuario-1",
  nome: "Maria Silva",
  email: "maria@ethosfinancial.local",
  perfil: "USUARIO" as const,
  ativo: true,
  criadoEm: new Date(),
};

const AUTOR = "admin-1";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("usuariosService.criar", () => {
  it("cria o usuário com senha hasheada e registra auditoria", async () => {
    repo.findByEmail.mockResolvedValue(null);
    repo.create.mockResolvedValue(usuarioFake as never);

    const resultado = await usuariosService.criar(
      { nome: "Maria Silva", email: usuarioFake.email, senha: "abc123", perfil: "USUARIO" },
      AUTOR,
    );

    expect(resultado).toBe(usuarioFake);
    expect(repo.create).toHaveBeenCalledOnce();
    const dadosCriados = repo.create.mock.calls[0][0] as { senhaHash: string };
    expect(dadosCriados.senhaHash).not.toBe("abc123");
    expect(auditoria).toHaveBeenCalledWith(
      expect.objectContaining({ entidade: "Usuario", acao: "CRIACAO", usuarioId: AUTOR }),
    );
  });

  it("rejeita quando já existe usuário com o mesmo e-mail", async () => {
    repo.findByEmail.mockResolvedValue(usuarioFake as never);

    await expect(
      usuariosService.criar(
        { nome: "Outra", email: usuarioFake.email, senha: "abc123", perfil: "USUARIO" },
        AUTOR,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(repo.create).not.toHaveBeenCalled();
  });
});

describe("usuariosService.buscarPorId", () => {
  it("lança NotFound quando o usuário não existe", async () => {
    repo.findByIdSeguro.mockResolvedValue(null);
    await expect(usuariosService.buscarPorId("x")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("usuariosService.atualizar", () => {
  it("atualiza e registra auditoria", async () => {
    repo.findByIdSeguro.mockResolvedValue(usuarioFake as never);
    repo.update.mockResolvedValue({ ...usuarioFake, perfil: "FINANCEIRO" } as never);

    await usuariosService.atualizar("usuario-1", { perfil: "FINANCEIRO" }, AUTOR);

    expect(repo.update).toHaveBeenCalledWith("usuario-1", { perfil: "FINANCEIRO" });
    expect(auditoria).toHaveBeenCalledWith(expect.objectContaining({ acao: "ATUALIZACAO" }));
  });
});

describe("usuariosService.alterarSenha", () => {
  it("gera um novo hash e registra auditoria sem expor a senha", async () => {
    repo.findByIdSeguro.mockResolvedValue(usuarioFake as never);
    repo.update.mockResolvedValue(usuarioFake as never);

    await usuariosService.alterarSenha("usuario-1", { senha: "novasenha1" }, AUTOR);

    const dadosAtualizados = repo.update.mock.calls[0][1] as { senhaHash: string };
    expect(dadosAtualizados.senhaHash).not.toBe("novasenha1");
    expect(auditoria).toHaveBeenCalledWith(
      expect.objectContaining({ detalhes: { camposAlterados: ["senha"] } }),
    );
  });
});
