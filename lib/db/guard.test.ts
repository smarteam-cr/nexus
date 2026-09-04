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
import fs from "node:fs";
import path from "node:path";
import {
  describirDestino,
  esHostProduccion,
  veredictoEscritura,
  veredictoPrismaCli,
  tieneAllowProdWriteFijo,
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

describe("guardPrismaCli — la lista positiva de escritura, y la destructiva SIN llave (B-01)", () => {
  // La decisión es pura: la misma función que corre prisma.config.ts, probada acá para que un
  // cambio de lista sea una decisión visible (un falso positivo rompería generate/build).
  const esEscritura = (invocacion: string) => veredictoPrismaCli(invocacion, LOCAL, {}).esEscritura;

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

  it("⛔ db push / migrate reset / migrate dev contra Supabase NO se destraban ni con ALLOW_PROD_WRITE=1", () => {
    /* La edicion que lo pone en rojo: volver a que la lista destructiva pase por el semáforo.
       `db push` ya se llevó RoleProfile una vez; con dos PCs sobre la misma base dropea columnas
       ajenas. Es un candado, no un semáforo — el patrón de assertLocalWriteOnly. */
    for (const cmd of ["node prisma db push", "node prisma migrate reset", "node prisma migrate dev --name x"]) {
      for (const url of [PROD, POOLER]) {
        const v = veredictoPrismaCli(cmd, url, { ALLOW_PROD_WRITE: "1" });
        expect(v.esDestructivo, cmd).toBe(true);
        expect(v.permitido, `${cmd} contra ${url} con ALLOW_PROD_WRITE=1`).toBe(false);
        expect(v.motivo).toMatch(/PROHIBIDOS/);
      }
      expect(veredictoPrismaCli(cmd, LOCAL, {}).permitido, `${cmd} contra local`).toBe(true);
    }
    // El semáforo de siempre sigue para lo que NO es destructivo.
    expect(veredictoPrismaCli("node prisma db execute --file x.sql", PROD, {}).permitido).toBe(false);
    expect(veredictoPrismaCli("node prisma db execute --file x.sql", PROD, { ALLOW_PROD_WRITE: "1" }).permitido).toBe(true);
    expect(veredictoPrismaCli("node prisma migrate deploy", PROD, { ALLOW_PROD_WRITE: "1" }).permitido).toBe(true);
  });

  it("ALLOW_PROD_WRITE fija en el .env se detecta (una línea comentada no cuenta)", () => {
    /* La edicion que lo pone en rojo: que tieneAllowProdWriteFijo devuelva false siempre. */
    expect(tieneAllowProdWriteFijo('DATABASE_URL="x"\nALLOW_PROD_WRITE=1\n')).toBe(true);
    expect(tieneAllowProdWriteFijo("export ALLOW_PROD_WRITE=1")).toBe(true);
    expect(tieneAllowProdWriteFijo('ALLOW_PROD_WRITE="0"'), "fija en 0 también es fija").toBe(true);
    expect(tieneAllowProdWriteFijo('# ALLOW_PROD_WRITE="1"\nDATABASE_URL="x"')).toBe(false);
    expect(tieneAllowProdWriteFijo("")).toBe(false);
  });
});

describe("las líneas base de eslint y tsc solo bajan (A-23)", () => {
  /**
   * `eslint-baseline.txt` decía 67 cuando el conteo real era 57 y nadie leía el archivo
   * (auditoría 2026-09-03). Dos custodias: `scripts/check-baselines.ts` compara la REALIDAD
   * contra los archivos (falla si la supera y también si quedó por debajo sin bajarla), y esta
   * guarda impide que los archivos SUBAN solos — subir uno exige tocar estos dos números, o sea
   * un diff que alguien lee.
   */
  const TOPE_ESLINT = 57;
  const TOPE_TSC = 0;
  const leer = (archivo: string) =>
    Number.parseInt(fs.readFileSync(path.join(process.cwd(), archivo), "utf8").trim(), 10);

  it("eslint-baseline.txt y tsc-baseline.txt son enteros y no pasan del tope", () => {
    /* La edicion que lo pone en rojo: escribir 58 en eslint-baseline.txt sin bajar la deuda. */
    const eslint = leer("eslint-baseline.txt");
    const tsc = leer("tsc-baseline.txt");
    expect(Number.isInteger(eslint) && eslint >= 0, "eslint-baseline.txt no es un entero").toBe(true);
    expect(Number.isInteger(tsc) && tsc >= 0, "tsc-baseline.txt no es un entero").toBe(true);
    expect(eslint, "la línea base de eslint SUBIÓ: la deuda solo baja").toBeLessThanOrEqual(TOPE_ESLINT);
    expect(tsc, "la línea base de tsc SUBIÓ: está en cero y se queda en cero").toBeLessThanOrEqual(TOPE_TSC);
  });

  it("scripts/check-baselines.ts compara la realidad contra los DOS archivos y falla si difiere", () => {
    /* La edicion que lo pone en rojo: que el script deje de leer uno de los archivos, o que
       devuelva 0 pase lo que pase. */
    const src = fs.readFileSync(path.join(process.cwd(), "scripts/check-baselines.ts"), "utf8");
    expect(src).toContain('"eslint-baseline.txt"');
    expect(src).toContain('"tsc-baseline.txt"');
    expect(src, "si la realidad supera la línea base tiene que fallar").toContain("real > base");
    expect(src, "si quedó por debajo, se baja en el mismo commit").toContain("real < base");
    expect(src).toContain("process.exit(resultados.every(Boolean) ? 0 : 1)");
  });
});
