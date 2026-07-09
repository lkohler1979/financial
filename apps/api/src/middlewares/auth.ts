import { NextFunction, Request, Response } from "express";
import type { PerfilUsuario } from "@prisma/client";
import { AppError } from "../shared/errors/app-error";
import { verificarToken } from "../shared/utils/jwt";

// Autenticação via JWT (Bearer). Substitui o antigo middleware de contexto
// baseado no header `x-usuario-id` — agora todo acesso a `/api/*` (exceto
// `/api/auth/login`) exige um token válido emitido no login.
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const cabecalho = req.header("authorization");
  const token = cabecalho?.startsWith("Bearer ") ? cabecalho.slice("Bearer ".length) : undefined;

  if (!token) {
    next(new AppError("Não autenticado", 401, "NAO_AUTENTICADO"));
    return;
  }

  try {
    const payload = verificarToken(token);
    req.usuarioId = payload.sub;
    req.usuarioPerfil = payload.perfil;
    next();
  } catch {
    next(new AppError("Sessão expirada ou token inválido", 401, "TOKEN_INVALIDO"));
  }
}

// RBAC: só permite a requisição seguir se o perfil do usuário autenticado
// estiver entre os perfis informados. Deve ser usado depois de `requireAuth`.
export function requireRole(...perfis: PerfilUsuario[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.usuarioPerfil || !perfis.includes(req.usuarioPerfil)) {
      next(new AppError("Você não tem permissão para acessar este recurso", 403, "SEM_PERMISSAO"));
      return;
    }
    next();
  };
}
