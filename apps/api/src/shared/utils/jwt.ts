import jwt from "jsonwebtoken";
import type { PerfilUsuario } from "@prisma/client";

export interface TokenPayload {
  sub: string;
  nome: string;
  email: string;
  perfil: PerfilUsuario;
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
