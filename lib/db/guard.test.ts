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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  describirDestino,
  esHostProduccion,
  veredictoEscritura,
  veredictoPrismaCli,
  tieneAllowProdWriteFijo,
  argumentosPgDump,
  nombreDelScript,
  planDeRespaldo,
  resolverApply,
  respaldarTablas,
  urlParaPgDump,
  type EjecutorDePgDump,
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

describe("deploy.sh EJECUTA el rollback y re-verifica /api/health (B-04)", () => {
  /**
   * Hasta el 2026-09-04 el script, ante un contenedor que no llegaba a healthy o un smoke fallido,
   * IMPRIMÍA el comando de rollback y salía con 1: producción quedaba caída hasta que alguien lo
   * copiara. Ahora lo ejecuta y vuelve a preguntar /api/health.
   */
  const src = () => fs.readFileSync(path.join(process.cwd(), "scripts/deploy.sh"), "utf8");

  it("hay una función rollback que vuelve a la imagen anterior y consulta la salud", () => {
    /* La edicion que lo pone en rojo: volver a imprimir el comando en vez de correrlo, o sacarle
       la re-verificación de /api/health. */
    const s = src();
    const inicio = s.indexOf("rollback() {");
    expect(inicio, "no hay función rollback()").toBeGreaterThan(-1);
    const fin = s.indexOf("\n}", inicio);
    const cuerpo = s.slice(inicio, fin);
    expect(cuerpo, "el tag a la imagen anterior tiene que EJECUTARSE, no imprimirse").toMatch(
      /^\s*docker tag nexus:prev nexus:latest\s*$/m,
    );
    expect(cuerpo).toContain("docker compose up -d --no-build app");
    expect(cuerpo, "el rollback tiene que volver a preguntar /api/health").toContain(
      'curl -fsS --max-time 10 "$HEALTH_URL"',
    );
  });

  it("los tres puntos de fallo llaman a rollback, y ninguno lo imprime", () => {
    const s = src();
    expect((s.match(/^\s*rollback\s*$/gm) ?? []).length, "faltan llamadas a rollback").toBeGreaterThanOrEqual(3);
    expect(/red "ROLLBACK: docker tag/.test(s), "volvió el rollback que solo se imprime").toBe(false);
  });
});

describe("todo --apply respalda las tablas que declara ANTES de escribir (B-06)", () => {
  /**
   * Hasta el 2026-09-04 un `--apply` escribía sin red: Supabase restaura la base ENTERA o nada, así
   * que un UPDATE equivocado sobre una tabla no tenía vuelta atrás parcial. Ahora el guard respalda
   * con pg_dump las `tablas` que el script declara, y si el respaldo falla NO hay escritura.
   */
  const AHORA = new Date(2026, 8, 4, 9, 5, 7); // 4 sep 2026 · 09:05:07 local
  const argvOriginal = process.argv;
  const urlOriginal = process.env.DATABASE_URL;
  let raiz = "";
  let stderr: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    raiz = fs.mkdtempSync(path.join(os.tmpdir(), "b06-"));
    process.argv = ["node", "C:/repo/scripts/cleanup-cross-client-session-projects.ts", "--apply"];
    process.env.DATABASE_URL = LOCAL; // host local: el guard deja pasar sin ALLOW_PROD_WRITE
    delete process.env.SIN_RESPALDO;
    stderr = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    process.argv = argvOriginal;
    if (urlOriginal === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = urlOriginal;
    delete process.env.SIN_RESPALDO;
    vi.restoreAllMocks();
    fs.rmSync(raiz, { recursive: true, force: true });
  });

  /** Un pg_dump falso que anota cómo lo llamaron y escribe el archivo que le pidieron. */
  const pgDumpFalso = (llamadas: string[][], contenido = "-- dump\n"): EjecutorDePgDump => (args) => {
    llamadas.push(args);
    const ruta = (args.find((a) => a.startsWith("--file=")) ?? "").slice("--file=".length);
    fs.writeFileSync(ruta, contenido);
    return { status: 0, detalle: "" };
  };
  const lineasDeStderr = (): string[] => stderr.mock.calls.map((c: unknown[]) => String(c[0]));

  it("el plan: backups/<fecha>-<script>/<Tabla>.<hora>.sql, sin repetidas, y rechaza lo que no es una tabla", () => {
    const plan = planDeRespaldo(["SessionProject", "Project", "SessionProject"], { script: "cleanup-x", ahora: AHORA, raiz });
    expect(plan.dir).toBe(path.join(raiz, "2026-09-04-cleanup-x"));
    expect(plan.archivos.map((a) => path.basename(a.ruta))).toEqual(["SessionProject.090507.sql", "Project.090507.sql"]);
    expect(() => planDeRespaldo([], { script: "x", ahora: AHORA })).toThrow("vacía");
    expect(() => planDeRespaldo(['Session"; DROP TABLE x; --'], { script: "x", ahora: AHORA })).toThrow("no es un nombre de tabla");
    expect(nombreDelScript("C:/repo/scripts/cleanup-x.ts")).toBe("cleanup-x");
  });

  it("la URL que recibe pg_dump pierde los parámetros de Prisma y conserva sslmode y credenciales", () => {
    const url = urlParaPgDump(`${POOLER}?pgbouncer=true&connection_limit=1&sslmode=require&schema=public`);
    expect(url).toBe("postgresql://user:secreta123@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require");
    const args = argumentosPgDump(PROD, "SessionProject", "backups/x/SessionProject.sql");
    expect(args).toContain("--data-only");
    expect(args, "los nombres de Prisma son PascalCase: pg_dump los cita").toContain('--table="SessionProject"');
    expect(args).toContain("--file=backups/x/SessionProject.sql");
    // Lo que se IMPRIME sigue siendo el destino sin credenciales.
    expect(describirDestino(PROD)).not.toContain("secreta123");
  });

  it("con --apply y tablas: el respaldo corre DESPUÉS del guard y ANTES de devolver true, y el archivo queda", () => {
    /* La edición que lo pone en rojo: sacarle a resolverApply la llamada a respaldarTablas —
       vuelve a ser el booleano de siempre y el script escribe sin red. */
    const llamadas: string[][] = [];
    const resultado = resolverApply({ tablas: ["SessionProject"], pgDump: pgDumpFalso(llamadas), raiz, ahora: AHORA });
    expect(resultado).toBe(true);
    expect(llamadas, "pg_dump tiene que haber corrido una vez por tabla").toHaveLength(1);
    expect(llamadas[0]).toContain('--table="SessionProject"');
    const ruta = path.join(raiz, "2026-09-04-cleanup-cross-client-session-projects", "SessionProject.090507.sql");
    expect(fs.existsSync(ruta), `falta el respaldo en ${ruta}`).toBe(true);
    const lineas = lineasDeStderr();
    const guard = lineas.findIndex((l) => l.includes("--apply → destino"));
    const respaldo = lineas.findIndex((l) => l.includes("respaldando SessionProject"));
    expect(guard, "el guard de prod tiene que decidir primero").toBeGreaterThan(-1);
    expect(respaldo).toBeGreaterThan(guard);
  });

  it("si pg_dump falla o deja el archivo vacío, NO hay escritura: aborta con exit 1", () => {
    /* La edición que lo pone en rojo: ignorar `r.ok` y devolver true igual — el script escribiría
       creyendo que tiene respaldo. */
    const salir = vi.spyOn(process, "exit").mockImplementation((code?: number | string | null) => {
      throw new Error(`exit ${code}`);
    });
    const roto: EjecutorDePgDump = () => ({ status: 1, detalle: "pg_dump: error: connection failed" });
    expect(() => resolverApply({ tablas: ["SessionProject"], pgDump: roto, raiz, ahora: AHORA })).toThrow("exit 1");
    expect(salir).toHaveBeenCalledWith(1);
    expect(lineasDeStderr().some((l) => l.includes("sin respaldo no hay escritura"))).toBe(true);

    const vacio = pgDumpFalso([], "");
    expect(() => resolverApply({ tablas: ["SessionProject"], pgDump: vacio, raiz, ahora: AHORA })).toThrow("exit 1");
    expect(lineasDeStderr().some((l) => l.includes("quedó vacío"))).toBe(true);
  });

  it("respaldarTablas para en la primera tabla que falla: un respaldo a medias no es un respaldo", () => {
    const plan = planDeRespaldo(["A", "B"], { script: "x", ahora: AHORA, raiz });
    let n = 0;
    const segundaFalla: EjecutorDePgDump = (args) => {
      n += 1;
      if (n === 1) return pgDumpFalso([])(args);
      return { status: null, detalle: "pg_dump no está instalado o no está en el PATH" };
    };
    const r = respaldarTablas(LOCAL, plan, segundaFalla);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("«B»");
  });

  it("sin --apply no respalda nada y devuelve false; sin tablas devuelve true pero AVISA; SIN_RESPALDO=1 salta a sabiendas", () => {
    const llamadas: string[][] = [];
    process.argv = ["node", "C:/repo/scripts/x.ts"];
    expect(resolverApply({ tablas: ["SessionProject"], pgDump: pgDumpFalso(llamadas), raiz })).toBe(false);
    expect(llamadas).toHaveLength(0);

    process.argv = ["node", "C:/repo/scripts/x.ts", "--apply"];
    expect(resolverApply({ pgDump: pgDumpFalso(llamadas), raiz })).toBe(true);
    expect(llamadas).toHaveLength(0);
    expect(lineasDeStderr().some((l) => l.includes("sin respaldo automático"))).toBe(true);

    process.env.SIN_RESPALDO = "1";
    expect(resolverApply({ tablas: ["SessionProject"], pgDump: pgDumpFalso(llamadas), raiz })).toBe(true);
    expect(llamadas).toHaveLength(0);
    expect(lineasDeStderr().some((l) => l.includes("SIN_RESPALDO=1"))).toBe(true);
  });
});
