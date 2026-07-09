export type Perfil = "ADMINISTRADOR" | "FINANCEIRO" | "USUARIO";

export interface UsuarioAutenticado {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
}

export interface LoginPayload {
  email: string;
  senha: string;
}

export interface LoginResponse {
  token: string;
  usuario: UsuarioAutenticado;
}
