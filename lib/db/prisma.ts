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
  // pg.Pool emite 'error' cuando un cliente OCIOSO falla — p. ej. el pooler de
  // Supabase (Supavisor) cierra conexiones idle. SIN este listener, Node trata
  // el evento como "unhandled 'error'" y MATA el proceso entero → nginx da 502.
  // Con el listener, el cliente roto se descarta y el Pool sigue (el próximo
  // query abre uno nuevo). Imprescindible al usar el connection pooler.
  pool.on("error", (err) => {
    console.error("[prisma] pg pool idle client error:", err.message);
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
