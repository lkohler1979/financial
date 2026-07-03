import IORedis from "ioredis";

// Conexão compartilhada entre filas (API) e workers. BullMQ exige
// maxRetriesPerRequest: null nas conexões que ele gerencia.
export const redisConnection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379/0", {
  maxRetriesPerRequest: null,
});
