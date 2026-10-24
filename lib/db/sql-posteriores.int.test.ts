/**
 * lib/db/sql-posteriores.int.test.ts — un `.sql` con su propio BEGIN que falla no traba la conexión, contra Postgres REAL.
 *
 * Sin el ROLLBACK de `aplicarSqlPosteriores` (scripts/lib/sql-posteriores.ts), la conexión queda en una transacción
 * abortada: todo lo que sigue falla con «current transaction is aborted» y el error real queda tapado. La prueba en
 * memoria (`sql-en-pasadas.test.ts`) no tiene esa trampa; esta sí (lo pidió /revisar, 2026-10-24).
 * Correr con la base local: `npm run test:int`.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { aplicarSqlPosteriores } from "../../scripts/lib/sql-posteriores";

const raiz = mkdtempSync(join(tmpdir(), "nexus-sql-"));
mkdirSync(join(raiz, "scripts", "sql"), { recursive: true });
writeFileSync(join(raiz, "scripts", "sql", "2099-01-01-roto-con-transaccion.sql"), `BEGIN;\nSELECT * FROM "TablaQueNoExiste_prueba";\nCOMMIT;\n`);
writeFileSync(join(raiz, "scripts", "sql", "2099-01-02-sano.sql"), `CREATE TABLE IF NOT EXISTS "zz_prueba_rollback" (id int);\n`);

afterAll(async () => {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "zz_prueba_rollback"`);
  rmSync(raiz, { recursive: true, force: true });
});

describe("aplicarSqlPosteriores — un SQL roto con transacción propia", () => {
  it("el siguiente se aplica igual, y el error dice el problema real, no «la transacción está abortada»", async () => {
    const error = await aplicarSqlPosteriores(process.env.DATABASE_URL ?? "", raiz).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    const mensaje = (error as Error).message;
    expect(mensaje).toContain("2099-01-01-roto-con-transaccion.sql");
    expect(mensaje).toContain("TablaQueNoExiste_prueba");
    expect(mensaje).not.toMatch(/current transaction is aborted/);
    expect(mensaje).not.toContain("2099-01-02-sano.sql");
    const [{ existe }] = await prisma.$queryRawUnsafe<{ existe: boolean }[]>(`SELECT to_regclass('"zz_prueba_rollback"') IS NOT NULL AS existe`);
    expect(existe).toBe(true);
  });
});
