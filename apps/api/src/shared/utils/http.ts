import { Request } from "express";

// No Express 5 os valores de req.params/req.usuarioId são tipados de forma
// permissiva. Estes helpers normalizam o acesso a valores de rota.

/** Retorna um parâmetro de rota como string (usa o primeiro valor se vier array). */
export function paramString(req: Request, nome: string): string {
  const valor = req.params[nome];
  return Array.isArray(valor) ? valor[0] : valor;
}

/** Id do usuário resolvido pelo request-context (garantido pelo middleware). */
export function usuarioAtual(req: Request): string {
  return req.usuarioId as string;
}
