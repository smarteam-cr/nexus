/**
 * scripts/lib/db.ts
 *
 * Conexión a DB para SCRIPTS one-off/recurrentes — con presupuesto de pool
 * ACOTADO. Contexto (la aritmética del incidente EMAXCONNSESSION de julio 2026):
 * el pooler de Supabase en session mode da ~15 slots COMPARTIDOS entre prod +
 * 2 PCs de dev + cualquier script corriendo. `new Pool()` sin `max` defaultea a
 * 10 → un script suelto podía comerse 2/3 del budget global y tirar producción
 * a "Connection terminated".
 *
 * Un script NO necesita paralelismo de pool: `max: 2` alcanza para cualquier
 * dry-run/apply secuencial (2 por si una query usa transacción + una lectura).
 *
 * Uso típico:
 *   import { createScriptDb } from "./lib/db";
 *   const { prisma, pool, close } = createScriptDb();
 *   try { ... } finally { await close(); }
 *
 * Solo-pg (sin Prisma):
 *   const { pool, close } = createScriptPool();
 *
 * Regla hermana del RUNBOOK: `prisma db push` JAMÁS contra el puerto 6543
 * (transaction pooling + DDL = bugs sutiles) — siempre contra el host directo.
 */
import { Pool } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const SCRIPT_POOL_MAX = 2;

export function createScriptPool(): { pool: Pool; close: () => Promise<void> } {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: falta DATABASE_URL en el entorno (.env).");
    process.exit(1);
  }
  const pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: SCRIPT_POOL_MAX,
    // Un script no debe dejar conexiones idle colgadas del budget compartido.
    idleTimeoutMillis: 10_000,
  });
  return { pool, close: () => pool.end() };
}

export function createScriptDb(): {
  prisma: PrismaClient;
  pool: Pool;
  close: () => Promise<void>;
} {
  const { pool, close } = createScriptPool();
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  return {
    prisma,
    pool,
    close: async () => {
      await prisma.$disconnect().catch(() => {});
      await close().catch(() => {});
    },
  };
}
