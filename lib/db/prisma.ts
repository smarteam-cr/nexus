import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  // Pool config explícito para latencia previsible en local dev (1 usuario,
  // Supabase remoto). En serverless (Vercel) cambiar a max: 1 + usar el pooler
  // 6543 con ?pgbouncer=true&connection_limit=1 en la URL.
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL!,
    ssl: { rejectUnauthorized: false },
    max: 10,                          // suficiente para Promise.all paralelos en 1 usuario
    idleTimeoutMillis: 30_000,        // mantener conexiones tibias entre navegaciones
    connectionTimeoutMillis: 5_000,   // fail rápido si Supabase no responde
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
