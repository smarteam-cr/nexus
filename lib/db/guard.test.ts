/**
 * lib/db/guard.test.ts — la LÓGICA PURA del guard anti-prod (scripts/lib/guard.ts).
 *
 * El guard vive en scripts/ (lo importan los ~60 scripts --apply y prisma.config.ts),
 * pero el test vive acá porque el project `unit` de vitest solo incluye lib/** — el
 * mismo patrón de los ~30 tests estructurales que escanean código fuera de lib.
 *
 * Qué se congela:
 *   - qué hosts cuentan como PRODUCCIÓN (supabase directo Y pooler);
 *   - que una URL rota o ausente es prod (fail-closed: ante la duda, no se escribe);
 *   - que la única llave es ALLOW_PROD_WRITE === "1" (ni "true", ni "yes");
 *   - que el destino impreso JAMÁS incluye credenciales;
 *   - qué comandos del CLI de Prisma cuentan como escritura (la lista positiva de
 *     guardPrismaCli — un falso positivo acá rompería `prisma generate` en el build).
 */
import { describe, expect, it } from "vitest";
import {
  describirDestino,
  esHostProduccion,
  veredictoEscritura,
} from "../../scripts/lib/guard";

const PROD = "postgresql://user:secreta123@db.abcd1234.supabase.co:5432/postgres";
const POOLER = "postgresql://user:secreta123@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
const LOCAL = "postgresql://postgres:postgres@localhost:5433/nexus_dev";
const DOCKER = "postgresql://postgres:postgres@127.0.0.1:5432/nexus_test";

describe("esHostProduccion", () => {
  it("supabase directo (*.supabase.co) es prod", () => {
    expect(esHostProduccion(PROD)).toBe(true);
  });

  it("el pooler (*.pooler.supabase.com) también es prod — cubre un cambio futuro de URL", () => {
    expect(esHostProduccion(POOLER)).toBe(true);
  });

  it("localhost y 127.0.0.1 no son prod", () => {
    expect(esHostProduccion(LOCAL)).toBe(false);
    expect(esHostProduccion(DOCKER)).toBe(false);
  });

  it("un host que solo CONTIENE 'supabase' sin ser subdominio no matchea (sin falsos positivos)", () => {
    expect(esHostProduccion("postgresql://u:p@supabase-mirror.interno.local:5432/db")).toBe(false);
  });

  it("FAIL-CLOSED: URL ausente o malformada cuenta como prod", () => {
    expect(esHostProduccion(undefined)).toBe(true);
    expect(esHostProduccion("esto no es una url")).toBe(true);
    expect(esHostProduccion("")).toBe(true);
  });
});

describe("veredictoEscritura", () => {
  it("prod sin ALLOW_PROD_WRITE → NO permitido", () => {
    const v = veredictoEscritura(PROD, {});
    expect(v.permitido).toBe(false);
    expect(v.motivo).toContain("PRODUCCIÓN");
  });

  it("prod con ALLOW_PROD_WRITE=1 → permitido (la única llave)", () => {
    expect(veredictoEscritura(PROD, { ALLOW_PROD_WRITE: "1" }).permitido).toBe(true);
  });

  it('valores "casi": "true", "yes", "0" NO abren el candado', () => {
    expect(veredictoEscritura(PROD, { ALLOW_PROD_WRITE: "true" }).permitido).toBe(false);
    expect(veredictoEscritura(PROD, { ALLOW_PROD_WRITE: "yes" }).permitido).toBe(false);
    expect(veredictoEscritura(PROD, { ALLOW_PROD_WRITE: "0" }).permitido).toBe(false);
  });

  it("host local → permitido sin variable (el guard no estorba el futuro dev local)", () => {
    expect(veredictoEscritura(LOCAL, {}).permitido).toBe(true);
  });

  it("sin DATABASE_URL → NO permitido, con motivo claro", () => {
    const v = veredictoEscritura(undefined, { ALLOW_PROD_WRITE: "1" });
    expect(v.permitido).toBe(false);
    expect(v.motivo).toContain("DATABASE_URL");
  });
});

describe("describirDestino — nunca credenciales", () => {
  it("devuelve host:puerto y nada más", () => {
    expect(describirDestino(PROD)).toBe("db.abcd1234.supabase.co:5432");
    expect(describirDestino(POOLER)).toBe("aws-0-us-east-1.pooler.supabase.com:6543");
  });

  it("ni el usuario ni la contraseña aparecen JAMÁS en el string", () => {
    for (const url of [PROD, POOLER, LOCAL]) {
      const destino = describirDestino(url);
      expect(destino).not.toContain("secreta123");
      expect(destino).not.toContain("user");
      expect(destino).not.toContain("postgres:postgres");
    }
  });

  it("sin puerto explícito cae a 5432", () => {
    expect(describirDestino("postgresql://u:p@db.x.supabase.co/postgres")).toBe(
      "db.x.supabase.co:5432",
    );
  });
});

describe("guardPrismaCli — la lista positiva de comandos de escritura", () => {
  // La misma regex del guard, probada acá para que un cambio de lista sea una decisión
  // visible: agregar un comando que no es de escritura rompería generate/build.
  const esEscritura = (invocacion: string) =>
    /\bdb\s+(execute|push|seed)\b/.test(invocacion) ||
    /\bmigrate\s+(resolve|deploy|reset|dev)\b/.test(invocacion);

  it("escritura: db execute/push/seed y migrate resolve/deploy/reset/dev", () => {
    expect(esEscritura("node prisma db execute --file x.sql")).toBe(true);
    expect(esEscritura("node prisma db push")).toBe(true);
    expect(esEscritura("node prisma db seed")).toBe(true);
    expect(esEscritura("node prisma migrate resolve --applied 0_init")).toBe(true);
    expect(esEscritura("node prisma migrate deploy")).toBe(true);
    expect(esEscritura("node prisma migrate reset")).toBe(true);
    expect(esEscritura("node prisma migrate dev")).toBe(true);
  });

  it("NO escritura (no-op absoluto): generate, validate, migrate diff, migrate status", () => {
    expect(esEscritura("node prisma generate")).toBe(false);
    expect(esEscritura("node prisma validate")).toBe(false);
    expect(esEscritura("node prisma migrate diff --from-empty --to-schema s.prisma")).toBe(false);
    expect(esEscritura("node prisma migrate status")).toBe(false);
  });
});
