import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AppError } from "../shared/errors/app-error";

// Middleware central de tratamento de erros. Traduz AppError, ZodError e erros
// conhecidos do Prisma para respostas JSON padronizadas.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(422).json({
      erro: "VALIDACAO",
      mensagem: "Dados inválidos",
      detalhes: err.issues.map((i) => ({ campo: i.path.join("."), mensagem: i.message })),
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      erro: err.codigo,
      mensagem: err.message,
      ...(err.detalhes !== undefined ? { detalhes: err.detalhes } : {}),
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002 = violação de restrição única; P2025 = registro não encontrado.
    if (err.code === "P2002") {
      res.status(409).json({
        erro: "CONFLITO",
        mensagem: "Já existe um registro com este valor único",
        detalhes: err.meta?.target,
      });
      return;
    }
    if (err.code === "P2025") {
      res.status(404).json({ erro: "NAO_ENCONTRADO", mensagem: "Recurso não encontrado" });
      return;
    }
  }

  console.error("[erro-nao-tratado]", err);
  res.status(500).json({ erro: "ERRO_INTERNO", mensagem: "Erro interno do servidor" });
}
