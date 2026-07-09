import { Perfil } from "./auth.model";

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
  criadoEm: string;
}

export interface CriarUsuarioPayload {
  nome: string;
  email: string;
  senha: string;
  perfil: Perfil;
}

export interface AtualizarUsuarioPayload {
  nome?: string;
  perfil?: Perfil;
  ativo?: boolean;
}
