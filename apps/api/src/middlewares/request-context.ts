import { NextFunction, Request, Response } from "express";
import { prisma } from "../database/prisma";

// -----------------------------------------------------------------------------
// Contexto de usuário da requisição.
//
// TEMPORÁRIO: enquanto o módulo `auth` (Sprint 7) não existe, não há JWT para
// identificar o usuário autenticado. Como toda alteração sensível PRECISA gerar
// registro de Auditoria (CLAUDE.md seção 4) e Auditoria.usuarioId é uma FK
// obrigatória, resolvemos o usuário atual a partir do header `x-usuario-id`
// (se informado e válido) ou de um usuário de sistema garantido em banco.
//
// Ver docs/PENDENCIAS.md: este middleware deve ser substituído pela extração do
// usuário do token JWT quando o Sprint 7 for implementado.
// -----------------------------------------------------------------------------

const EMAIL_SISTEMA = "sistema@ethosfinancial.local";

let usuarioSistemaIdCache: string | null = null;

async function obterUsuarioSistemaId(): Promise<string> {
  if (usuarioSistemaIdCache) return usuarioSistemaIdCache;

  const usuario = await prisma.usuario.upsert({
    where: { email: EMAIL_SISTEMA },
    update: {},
    create: {
      nome: "Sistema",
      email: EMAIL_SISTEMA,
      senhaHash: "!", // não usável para login; substituído pelo módulo auth
      perfil: "ADMINISTRADOR",
      ativo: false,
    },
  });

  usuarioSistemaIdCache = usuario.id;
  return usuario.id;
}

export async function requestContext(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const headerId = req.header("x-usuario-id");
    if (headerId) {
      const usuario = await prisma.usuario.findUnique({ where: { id: headerId } });
      if (usuario) {
        req.usuarioId = usuario.id;
        next();
        return;
      }
    }

    req.usuarioId = await obterUsuarioSistemaId();
    next();
  } catch (err) {
    next(err);
  }
}
