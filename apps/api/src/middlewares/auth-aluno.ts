import { NextFunction, Request, Response } from "express";
import { AppError } from "../shared/errors/app-error";
import { verificarTokenAluno } from "../shared/utils/jwt";

// Autenticação da área do aluno: aceita só token emitido por /portal/login
// (claim `tipo: "ALUNO"`); token de usuário do sistema não vale aqui.
export function requireAluno(req: Request, _res: Response, next: NextFunction): void {
  const cabecalho = req.header("authorization");
  const token = cabecalho?.startsWith("Bearer ") ? cabecalho.slice("Bearer ".length) : undefined;
  if (!token) {
    next(new AppError("Não autenticado", 401, "NAO_AUTENTICADO"));
    return;
  }
  try {
    const payload = verificarTokenAluno(token);
    if (!payload) throw new Error("não é token de aluno");
    req.alunoId = payload.sub;
    next();
  } catch {
    next(new AppError("Sessão expirada ou token inválido", 401, "TOKEN_INVALIDO"));
  }
}
