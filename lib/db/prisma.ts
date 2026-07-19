import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
};

// max de conexiones POR PROCESO. La base la comparten producción + DOS PCs de
// desarrollo + scripts one-off, contra un pooler con pool_size acotado (15 en
// session mode) — con max:10 en cada proceso, dos procesos ya lo agotaban
// (EMAXCONNSESSION en Sentry, 147 eventos). Por eso:
//   · prod: 10 (proceso único; con el pooler en transaction mode multiplexa).
//   · dev:   4 (dos PCs dejan de comerse el budget de prod).
//   · DB_POOL_MAX: perilla de escape sin tocar código.
const POOL_MAX = Number(
  process.env.DB_POOL_MAX ?? (process.env.NODE_ENV === "production" ? 10 : 4),
);

function createPrismaClient() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL!,
    ssl: { rejectUnauthorized: false },
    max: POOL_MAX,
    idleTimeoutMillis: 30_000, // mantener conexiones tibias entre navegaciones
    // 10s y no 5s: con max chico, las ráfagas del workspace (~10 requests
    // paralelos) ENCOLAN dentro del pool local — 5s convertía una cola sana en
    // "Connection terminated due to connection timeout". 10s da holgura sin
    // enmascarar un outage real.
    connectionTimeoutMillis: 10_000,
  });
  // pg.Pool emite 'error' cuando un cliente OCIOSO falla — p. ej. el pooler de
  // Supabase (Supavisor) cierra conexiones idle. SIN este listener, Node trata
  // el evento como "unhandled 'error'" y MATA el proceso entero → nginx da 502.
  // Con el listener, el cliente roto se descarta y el Pool sigue (el próximo
  // query abre uno nuevo). Imprescindible al usar el connection pooler.
  pool.on("error", (err) => {
    console.error("[prisma] pg pool idle client error:", err.message);
  });
  globalForPrisma.pgPool = pool;
  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Estado del pool para /api/health: cuántas conexiones abiertas, ociosas y
 * cuántos requests esperando un slot. `waiting` sostenido > 0 = presión de pool
 * (la antesala del "Connection terminated").
 */
export function poolStats(): { total: number; idle: number; waiting: number } | null {
  const p = globalForPrisma.pgPool;
  return p ? { total: p.totalCount, idle: p.idleCount, waiting: p.waitingCount } : null;
}
