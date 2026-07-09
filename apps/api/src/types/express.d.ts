// Augmentação do tipo Request do Express com o contexto da aplicação.

import type { PerfilUsuario } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      /** Id do usuário autenticado, resolvido pelo middleware `requireAuth` a partir do JWT. */
      usuarioId?: string;
      /** Perfil do usuário autenticado (RBAC), resolvido junto com `usuarioId`. */
      usuarioPerfil?: PerfilUsuario;
    }
  }
}

export {};
