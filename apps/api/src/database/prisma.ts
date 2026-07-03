import { PrismaClient } from "@prisma/client";

// Singleton do Prisma Client. Em desenvolvimento o ts-node-dev faz respawn do
// processo, então guardamos a instância no globalThis para evitar abrir
// múltiplas conexões durante o hot-reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
