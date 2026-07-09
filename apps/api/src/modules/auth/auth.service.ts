import { AppError } from "../../shared/errors/app-error";
import { compararSenha } from "../../shared/utils/senha";
import { gerarToken } from "../../shared/utils/jwt";
import { usuariosRepository } from "../usuarios/usuarios.repository";
import type { LoginInput } from "./auth.schema";

const CREDENCIAIS_INVALIDAS = "E-mail ou senha inválidos";

export const authService = {
  async login({ email, senha }: LoginInput) {
    const usuario = await usuariosRepository.findByEmail(email);
    if (!usuario || !usuario.ativo) {
      throw new AppError(CREDENCIAIS_INVALIDAS, 401, "CREDENCIAIS_INVALIDAS");
    }

    const senhaValida = await compararSenha(senha, usuario.senhaHash);
    if (!senhaValida) {
      throw new AppError(CREDENCIAIS_INVALIDAS, 401, "CREDENCIAIS_INVALIDAS");
    }

    const token = gerarToken({
      sub: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil,
    });

    return {
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil,
      },
    };
  },
};
