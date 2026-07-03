// Augmentação do tipo Request do Express com o contexto da aplicação.

declare global {
  namespace Express {
    interface Request {
      /** Id do usuário resolvido pelo middleware de contexto (auditoria). */
      usuarioId?: string;
    }
  }
}

export {};
