/**
 * scripts/aplicar-sql.ts — EL camino para aplicar un `scripts/sql/`: lo corre y lo anota en el registro de esa base.
 *
 *   npm run db:sql -- scripts/sql/2026-11-23-loquesea.sql                     simulacro: qué haría, sin tocar nada
 *   ALLOW_PROD_WRITE=1 npm run db:sql -- scripts/sql/2026-11-23-loquesea.sql --apply
 *   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/aplicar-sql.ts scripts/sql/2026-11-23-loquesea.sql --apply; Remove-Item Env:ALLOW_PROD_WRITE
 *
 * En PowerShell, por `npx tsx` y no por `npm run … --`: PowerShell se come el `--` y npm se queda con las banderas.
 * `--sin-transaccion` lo deja en `npm_config_*` y el script frena; `--apply` npm no lo deja en ningún lado (npm 10.9),
 * así que corre el simulacro, que lo avisa al final cuando lo lanzó npm.
 *
 * Reemplaza a `npx prisma db execute --file …` y al one-liner `npx tsx -e` de `ALTER TYPE … ADD VALUE`
 * (ARCHITECTURE Parte 0 · cap. D). Varios archivos van en el orden en que se escriben; se frena en el primero que falla.
 * Se le puede pasar la ruta o solo el nombre (`2026-11-23-loquesea.sql`); solo archivos de `scripts/sql/` (para
 * `prisma/policies.sql` está `npm run db:policies`).
 *
 * Cómo corre cada archivo (lib/db/registro-de-sql.ts › planDeAplicacion, lo dice el simulacro):
 *   · en UNA transacción, con la fila del registro adentro: o queda el cambio y la fila, o nada;
 *   · si el archivo trae su BEGIN/COMMIT, tal cual, y se anota después;
 *   · `--sin-transaccion`: sentencia por sentencia. Para un `ALTER TYPE … ADD VALUE` cuyo valor se usa más abajo en el
 *     mismo archivo (Postgres no deja usarlo dentro de la transacción que lo crea) o si la base responde «cannot run
 *     inside a transaction block». `CONCURRENTLY` lo pide solo.
 *
 * ⛔ El guard: el destino es el `DATABASE_URL` del `.env` (PRODUCCIÓN) y `--apply` exige `ALLOW_PROD_WRITE=1`
 * (scripts/lib/guard.ts, INV12). Sin el registro en la base, solo deja aplicar el `.sql` que lo crea
 * (`2026-11-23-registro-de-sql.sql`). Sin respaldo automático: es DDL aditivo e idempotente; un `.sql` que cambia DATOS
 * se mira dos veces antes del `--apply`.
 *
 * Después de un cambio de schema: `npx prisma generate` y reiniciar el dev server. Decisión: docs/DECISIONS.md ›
 * «Registro de los SQL aplicados».
 */
import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { createScriptPool } from "./lib/db";
import { assertProdWriteAllowed, describirDestino } from "./lib/guard";
import {
  SQL_DEL_REGISTRO,
  banderasQueSeQuedoNpm,
  huellaDeSql,
  pideSinTransaccion,
  planDeAplicacion,
  type FilaDelRegistro,
} from "../lib/db/registro-de-sql";
import { ErrorAlAplicar, aplicarYAnotar, desdeEstaMaquina, existeElRegistro, leerRegistro } from "../lib/db/registro-de-sql-base";

const RAIZ = process.cwd();
const DIR_SQL = join(RAIZ, "scripts", "sql");
const APPLY = process.argv.includes("--apply");
const SIN_TRANSACCION = process.argv.includes("--sin-transaccion");
const COMANDO = "npm run db:sql";

/** De lo que se escribió en la línea de comandos a un archivo de `scripts/sql/`, o el motivo por el que no lo es. */
function resolverArchivo(arg: string): { nombre: string; ruta: string } | { error: string } {
  const conExtension = arg.endsWith(".sql") ? arg : `${arg}.sql`;
  const ruta = /[\\/]/.test(conExtension) ? resolve(RAIZ, conExtension) : join(DIR_SQL, conExtension);
  if (resolve(dirname(ruta)) !== resolve(DIR_SQL)) {
    return { error: `${arg}: solo se aplican archivos de scripts/sql/ (para prisma/policies.sql: npm run db:policies).` };
  }
  if (!existsSync(ruta)) return { error: `${arg}: no existe ${join("scripts", "sql", basename(ruta))}.` };
  return { nombre: basename(ruta), ruta };
}

function fecha(d: Date): string {
  return d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

/** La línea del registro de un archivo, para el simulacro. */
function enElRegistro(fila: FilaDelRegistro | undefined, huella: string): string {
  if (!fila) return "nuevo en el registro de esta base";
  const cuando = `${fila.como} el ${fecha(new Date(fila.aplicadoEn))} desde ${fila.desde}`;
  return fila.huella === huella
    ? `ya anotado (${cuando}), con esta misma versión: reaplicarlo es inocuo si es idempotente`
    : `anotado con OTRA versión (${cuando}): el archivo cambió después de aplicarse`;
}

async function main(): Promise<number> {
  const perdidas = banderasQueSeQuedoNpm(["--apply", "--sin-transaccion"], process.argv, process.env);
  if (perdidas.length > 0) {
    console.error(`✗ npm se quedó con ${perdidas.join(" y ")} y no le llegó al script (pasa en PowerShell, que se come el «--»). No se hizo nada.`);
    console.error(`  Córrelo así: npx tsx scripts/aplicar-sql.ts <archivos> ${perdidas.join(" ")}`);
    return 2;
  }
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (args.length === 0) {
    console.error("Uso: npm run db:sql -- scripts/sql/<archivo>.sql [más archivos] [--sin-transaccion] [--apply]");
    return 2;
  }
  const archivos: Array<{ nombre: string; texto: string }> = [];
  for (const arg of args) {
    const r = resolverArchivo(arg);
    if ("error" in r) {
      console.error(`✗ ${r.error}`);
      return 2;
    }
    archivos.push({ nombre: r.nombre, texto: readFileSync(r.ruta, "utf8") });
  }

  const url = process.env.DATABASE_URL;
  if (APPLY) assertProdWriteAllowed(COMANDO);
  else {
    // El simulacro no escribe, ni por error: la conexión nace de solo lectura.
    process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on"].filter(Boolean).join(" ");
  }
  const { pool, close } = createScriptPool();
  const cliente = await pool.connect();
  try {
    const hayRegistro = await existeElRegistro(cliente);
    const registro = new Map((hayRegistro ? await leerRegistro(cliente) : []).map((f) => [f.archivo, f]));
    console.log(`\n${APPLY ? "APLICAR" : "SIMULACRO"} en ${describirDestino(url)}:\n`);
    let creaElRegistro = false;
    for (const a of archivos) {
      const huella = huellaDeSql(a.texto);
      const plan = planDeAplicacion(a.texto, SIN_TRANSACCION);
      console.log(`· ${a.nombre}  (huella ${huella.slice(0, 12)})`);
      console.log(`    cómo: ${plan.modo === "sentencias" ? `${plan.sentencias.length} sentencias, una por una` : plan.motivo}`);
      if (plan.sinCerrar) {
        console.error(`\n✗ ${a.nombre} abre una transacción (BEGIN) y no la cierra (COMMIT): no se aplica. Arregla el archivo.`);
        return 1;
      }
      if (hayRegistro || creaElRegistro) console.log(`    registro: ${enElRegistro(registro.get(a.nombre), huella)}`);
      else if (a.nombre === SQL_DEL_REGISTRO) {
        console.log("    registro: este archivo lo crea, y se anota a sí mismo");
        creaElRegistro = true;
      } else {
        console.error(
          `\n✗ La base no tiene el registro de SQL (SqlAplicado). Aplica primero scripts/sql/${SQL_DEL_REGISTRO} ` +
            `(puede ir en el mismo comando, antes que este). No se aplicó nada.`,
        );
        return 1;
      }
    }
    if (!APPLY) {
      console.log(`\nNo se aplicó nada. Para aplicarlo, el mismo comando con --apply (y ALLOW_PROD_WRITE=1 si es producción).`);
      if (process.env.npm_lifecycle_event === "db:sql") {
        console.log("(Si escribiste --apply y lo corriste con npm run desde PowerShell, npm se lo quedó: PowerShell se come el «--».");
        console.log(" Para aplicar en PowerShell: npx tsx scripts/aplicar-sql.ts <archivos> --apply.)");
      }
      return 0;
    }

    console.log("");
    const desde = desdeEstaMaquina(COMANDO + (SIN_TRANSACCION ? " --sin-transaccion" : ""));
    for (const [i, a] of archivos.entries()) {
      try {
        const { modo } = await aplicarYAnotar(cliente, a, { desde, sinTransaccion: SIN_TRANSACCION });
        console.log(`✓ ${a.nombre} aplicado y anotado (${modo === "transaccion" ? "en una transacción" : modo === "propia" ? "con su transacción" : "sentencia por sentencia"})`);
      } catch (e) {
        if (!(e instanceof ErrorAlAplicar)) throw e;
        console.error(`\n✗ ${a.nombre} falló: ${e.detalle}`);
        if (e.modo === "transaccion" || e.modo === "propia") console.error("  No quedó nada de este archivo (ROLLBACK) y no se anotó.");
        else console.error(`  Falló la sentencia ${e.sentencia}: las anteriores YA quedaron aplicadas. No se anotó. Arréglalo y vuelve a correrlo.`);
        if (pideSinTransaccion(e.detalle)) console.error("  → Esto se arregla corriéndolo sentencia por sentencia: el mismo comando con --sin-transaccion.");
        const pendientes = archivos.slice(i + 1).map((x) => x.nombre);
        if (pendientes.length > 0) console.error(`  No se intentaron: ${pendientes.join(", ")}.`);
        return 1;
      }
    }
    console.log("\nSi cambió el schema: npx prisma generate y reiniciar el dev server. `npm run check:esquema` dice qué falta.");
    return 0;
  } finally {
    cliente.release();
    await close();
  }
}

main()
  .then((codigo) => process.exit(codigo))
  .catch((e) => {
    console.error(e);
    process.exit(2);
  });
