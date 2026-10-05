import jwt from "jsonwebtoken";
import type { PerfilUsuario } from "@prisma/client";

export interface TokenPayload {
  sub: string;
  nome: string;
  email: string;
  perfil: PerfilUsuario;
}

/** Token da área do aluno — `sub` é o id do Aluno. Nunca vale como token de
 * usuário do sistema (ver `requireAuth`). */
export interface TokenAlunoPayload {
  sub: string;
  nome: string;
  tipo: "ALUNO" | "SACADO";
}

function segredo(): string {
  const segredo = process.env.JWT_SECRET;
  if (!segredo) throw new Error("JWT_SECRET não configurado");
  return segredo;
}

export function gerarToken(payload: TokenPayload): string {
  const expiresIn = process.env.JWT_EXPIRES_IN ?? "1h";
  return jwt.sign(payload, segredo(), { expiresIn } as jwt.SignOptions);
}

export function verificarToken(token: string): TokenPayload {
  return jwt.verify(token, segredo()) as unknown as TokenPayload;
}

/** Token da área do aluno (`tipo` ALUNO, sub = id do aluno) ou do sacado
 * (`tipo` SACADO, sub = id do sacado — vê só os títulos que paga). */
export function gerarTokenAluno(payload: Omit<TokenAlunoPayload, "tipo"> & { tipo?: "ALUNO" | "SACADO" }): string {
  const expiresIn = process.env.JWT_ALUNO_EXPIRES_IN ?? "2h";
  return jwt.sign({ ...payload, tipo: payload.tipo ?? "ALUNO" }, segredo(), { expiresIn } as jwt.SignOptions);
}

/** Retorna o payload só se for token da área do aluno/sacado; null para token de usuário. */
export function verificarTokenAluno(token: string): TokenAlunoPayload | null {
  const payload = jwt.verify(token, segredo()) as unknown as Partial<TokenAlunoPayload>;
  return (payload.tipo === "ALUNO" || payload.tipo === "SACADO") && payload.sub
    ? (payload as TokenAlunoPayload)
    : null;
}
