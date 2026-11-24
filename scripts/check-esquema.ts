/**
 * scripts/check-esquema.ts — SOLO LECTURA. ¿A la base le falta algo que ESTE código usa?
 *
 * El aviso ANTES del deploy. Los cambios de esquema son SQL a mano que se corren antes de
 * desplegar (ARCHITECTURE Parte 0 · cap. D). Esto contesta dos preguntas sobre la base del `.env`:
 *
 *   1. ¿Le falta algo que este código usa? Compara lo que espera el cliente Prisma del checkout
 *      (tablas, columnas, enums y sus valores) contra el catálogo, y dice qué archivo de
 *      `scripts/sql/` lo crea.
 *   2. ¿Qué `scripts/sql/` posteriores al baseline no están en su registro (`SqlAplicado`, desde el
 *      2026-11-23)? Ve lo que la pregunta 1 no ve: un `.sql` que solo crea un índice o una política,
 *      o que cambia datos, y uno cuyo código todavía no salió. Dice también cuáles cambiaron después
 *      de anotarse y cuáles anotó otra rama o la otra PC. Se aplican con `npm run db:sql`, que anota;
 *      los que corrieron por fuera del registro se anotan con `npm run db:sql:backfill`.
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
 * y hace una consulta al catálogo y dos al registro. No usa `--apply` ni `ALLOW_PROD_WRITE`.
 *
 * Sale con 0 si no falta nada, 1 si falta algo (en el esquema o en el registro), 2 si no pudo comparar.
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
import { SQL_DEL_REGISTRO, compararConElRegistro, type FilaDelRegistro } from "../lib/db/registro-de-sql";
import { existeElRegistro, leerRegistro } from "../lib/db/registro-de-sql-base";

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

  const { prisma, pool, close } = createScriptDb();
  let real: Esquema;
  /** `null`: la base no tiene la tabla del registro. */
  let registro: FilaDelRegistro[] | null;
  try {
    real = await leerEsquemaDeLaBase(prisma);
    registro = (await existeElRegistro(pool)) ? await leerRegistro(pool) : null;
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
  } else {
    console.error(`✗ A la base le faltan ${faltantes.length} cosa(s) que este código usa:\n`);
    for (const [sql, lineas] of agruparPorSql(faltantes)) {
      console.error(`  ${sql}`);
      for (const linea of lineas) console.error(`    - ${linea}`);
    }
    console.error("\n  Esos SQL van ANTES del deploy, en el orden de su fecha, con npm run db:sql (docs/RUNBOOK.md › Deploy).");
    console.error("  Con esto sin correr, /api/health responde 503 y deploy.sh revierte solo a la imagen anterior.");
  }
  const pendientesDelRegistro = informarDelRegistro(registro);
  return faltantes.length > 0 || pendientesDelRegistro > 0 ? 1 : 0;
}

/** El registro de los SQL aplicados contra los `scripts/sql/` de este checkout. Devuelve cuántos quedan pendientes. */
function informarDelRegistro(filas: FilaDelRegistro[] | null): number {
  const lista = (lineas: string[]) => lineas.forEach((l) => console.error(`    - ${l}`));
  if (filas === null) {
    console.error("\n✗ La base no tiene el registro de los SQL aplicados (tabla SqlAplicado).");
    console.error(`  Se crea con: npm run db:sql -- scripts/sql/${SQL_DEL_REGISTRO} --apply  (ALLOW_PROD_WRITE=1 en producción),`);
    console.error("  y lo que ya corrió se anota con: npm run db:sql:backfill (simulacro), y después con --apply.");
    return 1;
  }
  const estado = compararConElRegistro(sqlDelRepo(), filas);
  if (estado.sinAnotar.length === 0 && estado.cambiados.length === 0) {
    console.log(`✓ Registro de SQL: los ${estado.posteriores} scripts/sql posteriores al baseline están anotados en esta base.`);
  }
  if (estado.sinAnotar.length > 0) {
    console.error(
      `\n✗ Registro de SQL: ${estado.sinAnotar.length} de ${estado.posteriores} scripts/sql posteriores al baseline sin anotar en esta base. ¿Corrieron?`,
    );
    lista(estado.sinAnotar);
    console.error("  Si no corrieron: npm run db:sql -- scripts/sql/<archivo> (simulacro), y después con --apply.");
    console.error("  Si corrieron por fuera del registro: npm run db:sql:backfill (los anota si el esquema lo demuestra, o con --marcar).");
  }
  if (estado.cambiados.length > 0) {
    console.error(`\n⚠ Cambiaron después de anotarse (${estado.cambiados.length}): reaplícalos con npm run db:sql (son idempotentes).`);
    lista(
      estado.cambiados.map(
        ({ archivo, fila }) => `${archivo}  (anotado el ${new Date(fila.aplicadoEn).toISOString().slice(0, 10)} desde ${fila.desde})`,
      ),
    );
  }
  if (estado.ajenos.length > 0) {
    console.log(`\n· Anotados en esta base que este checkout no tiene (${estado.ajenos.length}): ¿de otra rama o de la otra PC? (git pull)`);
    estado.ajenos.forEach((f) => console.log(`    - ${f.archivo}  (desde ${f.desde})`));
  }
  return estado.sinAnotar.length + estado.cambiados.length;
}

main()
  .then((codigo) => process.exit(codigo))
  .catch((e) => {
    console.error(e);
    process.exit(2);
  });
