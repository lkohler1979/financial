import { AsyncLocalStorage } from "node:async_hooks";

interface AuditoriaRequestContext {
  usuarioId: string;
  auditoriaRegistrada: boolean;
}

const storage = new AsyncLocalStorage<AuditoriaRequestContext>();

export function executarComContextoAuditoria<T>(usuarioId: string, callback: () => T): T {
  return storage.run({ usuarioId, auditoriaRegistrada: false }, callback);
}

export function obterContextoAuditoria(): AuditoriaRequestContext | undefined {
  return storage.getStore();
}

export function marcarAuditoriaRegistrada(): void {
  const contexto = storage.getStore();
  if (contexto) contexto.auditoriaRegistrada = true;
}
