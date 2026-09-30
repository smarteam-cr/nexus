/**
 * scripts/check-esquema.ts — SOLO LECTURA. ¿A la base le falta algo que ESTE código usa?
 *
 * El aviso ANTES del deploy. Los cambios de esquema son SQL a mano que se corren antes de
 * desplegar (ARCHITECTURE Parte 0 · cap. D) y no hay registro de cuáles ya corrieron. Esto compara
 * lo que espera el cliente Prisma del checkout (tablas, columnas, enums y sus valores) contra el
 * catálogo de la base del `.env`, y dice qué falta y qué archivo de `scripts/sql/` lo crea:
 *
 *   npm run check:esquema          (o: npx tsx scripts/check-esquema.ts)
 *
 * Es la MISMA comparación que hace `/api/health` en el contenedor (lib/db/esquema-esperado.ts):
 * si el checkout es lo que se va a desplegar, lo que acá sale como faltante es lo que haría que el
 * deploy se revierta solo. Correrlo antes evita llegar a eso. Si el checkout NO es lo que se
 * despliega (el schema tiene cambios sin commitear, u `origin/main` trae cambios del schema que acá
 * no están), lo dice antes del resultado. Lo que la base tiene de más
 * (`KnowledgeEmbedding.embedding`, índices, las tablas de una tanda que todavía no salió) no es un
 * error y no se lista.
 *
 * No escribe nada, nunca: la conexión nace de solo lectura (Postgres rechaza cualquier escritura)
 * y hace UNA consulta al catálogo. No usa `--apply` ni `ALLOW_PROD_WRITE`.
 *
 * Sale con 0 si no falta nada, 1 si falta algo, 2 si no pudo comparar.
 *
 * ⚠ Compara contra el cliente GENERADO. Si `prisma/schema.prisma` cambió (un `git pull`) y no se
 * corrió `npx prisma generate`, el cliente es de otro schema: el script lo detecta y no compara.
 * Distinto de INV4 e INV7 (`check:invariants`), que miran lo mismo desde el texto del schema pero
 * corren junto con todos los demás invariantes (HubSpot incluido): esto contesta una sola pregunta
 * en un par de segundos, que es lo que hace falta justo antes de desplegar.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createScriptDb } from "./lib/db";
import {
  compararEsquema,
  describirFaltante,
  mismoSchema,
  sqlQueNombran,
  type Esquema,
  type Faltante,
} from "../lib/db/esquema-esperado";
import { esperadoDeEsteCliente, leerEsquemaDeLaBase } from "../lib/db/salud-del-esquema";

const RAIZ = process.cwd();
const SIN_SQL = "(ningún archivo de scripts/sql/ lo crea)";

/* ⛔ Ni por error: la conexión nace de solo lectura y con tope de tiempo. `pg` lee PGOPTIONS al
   abrir cada conexión, y la primera se abre con la consulta al catálogo, más abajo. */
process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=20000"]
  .filter(Boolean)
  .join(" ");

/** ¿El cliente generado es el del schema de este checkout? `null` = no hay cliente generado. */
function clienteAlDia(): boolean | null {
  const copia = join(RAIZ, "node_modules", ".prisma", "client", "schema.prisma");
  if (!existsSync(copia)) return null;
  return mismoSchema(readFileSync(join(RAIZ, "prisma", "schema.prisma"), "utf8"), readFileSync(copia, "utf8"));
}

/**
 * ¿El schema de este checkout es el que se va a desplegar? El VPS despliega `origin/main`. No se
 * hace `git fetch` (no se toca nada): se mira `origin/main` a la fecha del último fetch o pull.
 * Sin git, no dice nada.
 */
function avisosDelCheckout(): string[] {
  const git = (...args: string[]) => spawnSync("git", args, { cwd: RAIZ, encoding: "utf8" });
  const avisos: string[] = [];
  const estado = git("status", "--porcelain", "--", "prisma/schema.prisma");
  if (estado.status !== 0) return avisos;
  if (estado.stdout.trim()) {
    avisos.push(
      "prisma/schema.prisma tiene cambios SIN COMMITEAR (¿de otra sesión?): se compara con ellos, y eso no se despliega.",
    );
  }
  const alDia = git("merge-base", "--is-ancestor", "origin/main", "HEAD");
  // 1 = origin/main tiene commits que HEAD no; ¿alguno cambió el schema?
  if (alDia.status === 1 && git("diff", "--quiet", "HEAD...origin/main", "--", "prisma/schema.prisma").status === 1) {
    avisos.push(
      "origin/main trae cambios de prisma/schema.prisma que este checkout no tiene (¿los subió la otra PC?): " +
        "haz `git pull`, `npx prisma generate` y vuelve a correr esto.",
    );
  }
  return avisos;
}

/** Los SQL de `scripts/sql/`, en orden de fecha (el nombre empieza con AAAA-MM-DD). */
function sqlDelRepo(): Array<{ nombre: string; texto: string }> {
  const dir = join(RAIZ, "scripts", "sql");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((nombre) => ({ nombre, texto: readFileSync(join(dir, nombre), "utf8") }));
}

/** Agrupa lo que falta por el SQL más viejo que lo crea, en orden de fecha; lo que nadie crea, al final. */
function agruparPorSql(faltantes: ReadonlyArray<Faltante>): Map<string, string[]> {
  const archivos = sqlDelRepo();
  const grupos = new Map<string, string[]>();
  for (const f of faltantes) {
    const [primero, ...otros] = sqlQueNombran(f, archivos);
    const clave = primero ? `scripts/sql/${primero}` : SIN_SQL;
    const linea = describirFaltante(f) + (otros.length > 0 ? `   (también en ${otros.join(", ")})` : "");
    grupos.set(clave, [...(grupos.get(clave) ?? []), linea]);
  }
  return new Map([...grupos].sort(([a], [b]) => (a === SIN_SQL ? 1 : b === SIN_SQL ? -1 : a.localeCompare(b))));
}

async function main(): Promise<number> {
  const alDia = clienteAlDia();
  if (alDia !== true) {
    console.error(
      alDia === null
        ? "⚠ No hay cliente Prisma generado (node_modules/.prisma/client)."
        : "⚠ El cliente Prisma generado es de OTRO schema: prisma/schema.prisma cambió después del último `prisma generate`.",
    );
    console.error("  Corre `npx prisma generate` y vuelve a correr este chequeo. Sin eso compararía contra lo que el código esperaba antes.");
    return 2;
  }
  for (const aviso of avisosDelCheckout()) console.error(`⚠ ${aviso}`);
  const esperado = esperadoDeEsteCliente();
  if (esperado.tablas.size === 0) {
    console.error("⚠ El cliente Prisma no expone su modelo de datos (¿cambió la versión de Prisma?): no hay contra qué comparar.");
    return 2;
  }

  const { prisma, close } = createScriptDb();
  let real: Esquema;
  try {
    real = await leerEsquemaDeLaBase(prisma);
  } catch (e) {
    console.error(`⚠ No se pudo leer el catálogo de la base: ${e instanceof Error ? e.message : String(e)}`);
    return 2;
  } finally {
    await close();
  }
  if (real.tablas.size === 0) {
    console.error("⚠ El catálogo no devolvió ninguna tabla de `public`: eso es no haber visto la base, no que falte todo.");
    return 2;
  }

  const columnas = [...esperado.tablas.values()].reduce((n, cols) => n + cols.size, 0);
  const faltantes = compararEsquema(esperado, real);
  if (faltantes.length === 0) {
    console.log(
      `✓ La base tiene todo lo que este código espera: ${esperado.tablas.size} tablas, ${columnas} columnas y ${esperado.enums.size} enums.`,
    );
    return 0;
  }

  console.error(`✗ A la base le faltan ${faltantes.length} cosa(s) que este código usa:\n`);
  for (const [sql, lineas] of agruparPorSql(faltantes)) {
    console.error(`  ${sql}`);
    for (const linea of lineas) console.error(`    - ${linea}`);
  }
  console.error("\n  Esos SQL van ANTES del deploy, en el orden de su fecha (docs/RUNBOOK.md › Deploy).");
  console.error("  Con esto sin correr, /api/health responde 503 y deploy.sh revierte solo a la imagen anterior.");
  return 1;
}

main()
  .then((codigo) => process.exit(codigo))
  .catch((e) => {
    console.error(e);
    process.exit(2);
  });
