import type { ConnectionOptions } from "bullmq";

function criarOpcoesRedis(): ConnectionOptions {
  const url = new URL(process.env.REDIS_URL || "redis://localhost:6379/0");
  const db = Number(url.pathname.replace("/", "") || 0);

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    db,
    username: url.username || undefined,
    password: url.password || undefined,
    maxRetriesPerRequest: null,
  };
}

// Opções compartilhadas entre filas (API) e workers. Usar objeto de conexão
// evita conflitos de tipo quando BullMQ e a aplicação resolvem versões
// diferentes de ioredis no workspace.
export const redisConnection = criarOpcoesRedis();
