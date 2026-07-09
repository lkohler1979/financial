import { beforeEach, describe, expect, it, vi } from "vitest";
import { authService } from "../../src/modules/auth/auth.service";
import { usuariosRepository } from "../../src/modules/usuarios/usuarios.repository";
import * as senhaUtils from "../../src/shared/utils/senha";
import * as jwtUtils from "../../src/shared/utils/jwt";
import { AppError } from "../../src/shared/errors/app-error";

vi.mock("../../src/modules/usuarios/usuarios.repository", () => ({
  usuariosRepository: {
    findByEmail: vi.fn(),
  },
}));

vi.mock("../../src/shared/utils/senha", () => ({
  compararSenha: vi.fn(),
}));

vi.mock("../../src/shared/utils/jwt", () => ({
  gerarToken: vi.fn(),
}));

const repo = vi.mocked(usuariosRepository);
const compararSenha = vi.mocked(senhaUtils.compararSenha);
const gerarToken = vi.mocked(jwtUtils.gerarToken);

const usuarioFake = {
  id: "usuario-1",
  nome: "Maria Silva",
  email: "maria@ethosfinancial.local",
  senhaHash: "hash-fake",
  perfil: "ADMINISTRADOR" as const,
  ativo: true,
  criadoEm: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authService.login", () => {
  it("retorna token e dados do usuário quando as credenciais são válidas", async () => {
    repo.findByEmail.mockResolvedValue(usuarioFake as never);
    compararSenha.mockResolvedValue(true);
    gerarToken.mockReturnValue("token-fake");

    const resultado = await authService.login({ email: usuarioFake.email, senha: "abc123" });

    expect(resultado.token).toBe("token-fake");
    expect(resultado.usuario).toEqual({
      id: usuarioFake.id,
      nome: usuarioFake.nome,
      email: usuarioFake.email,
      perfil: usuarioFake.perfil,
    });
    expect(gerarToken).toHaveBeenCalledWith({
      sub: usuarioFake.id,
      nome: usuarioFake.nome,
      email: usuarioFake.email,
      perfil: usuarioFake.perfil,
    });
  });

  it("rejeita quando o usuário não existe", async () => {
    repo.findByEmail.mockResolvedValue(null);

    await expect(
      authService.login({ email: "naoexiste@ethosfinancial.local", senha: "abc123" }),
    ).rejects.toBeInstanceOf(AppError);
    expect(compararSenha).not.toHaveBeenCalled();
  });

  it("rejeita quando o usuário está inativo", async () => {
    repo.findByEmail.mockResolvedValue({ ...usuarioFake, ativo: false } as never);

    await expect(
      authService.login({ email: usuarioFake.email, senha: "abc123" }),
    ).rejects.toBeInstanceOf(AppError);
    expect(compararSenha).not.toHaveBeenCalled();
  });

  it("rejeita quando a senha está incorreta", async () => {
    repo.findByEmail.mockResolvedValue(usuarioFake as never);
    compararSenha.mockResolvedValue(false);

    await expect(
      authService.login({ email: usuarioFake.email, senha: "errada" }),
    ).rejects.toBeInstanceOf(AppError);
    expect(gerarToken).not.toHaveBeenCalled();
  });
});
