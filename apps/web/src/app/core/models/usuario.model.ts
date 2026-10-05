import { Perfil } from "./auth.model";

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
  /** Pode deferir (aprovar/reprovar) documentos — administrador sempre pode. */
  podeDeferirDocumentos?: boolean;
  criadoEm: string;
}

export interface CriarUsuarioPayload {
  nome: string;
  email: string;
  senha: string;
  perfil: Perfil;
  podeDeferirDocumentos?: boolean;
}

export interface AtualizarUsuarioPayload {
  nome?: string;
  perfil?: Perfil;
  ativo?: boolean;
  podeDeferirDocumentos?: boolean;
}
