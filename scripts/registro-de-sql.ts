/**
 * scripts/registro-de-sql.ts — el BACKFILL del registro de SQL: anota los `scripts/sql/` que corrieron antes de que
 * existiera el registro, o por fuera de él.
 *
 *   npm run db:sql:backfill                                     simulacro: qué anotaría y por qué (solo lee)
 *   ALLOW_PROD_WRITE=1 npm run db:sql:backfill -- --apply       anota los que el esquema demuestra
 *   ALLOW_PROD_WRITE=1 npm run db:sql:backfill -- --marcar 2026-08-21-a.sql,2026-10-30-b.sql --apply
 *   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/registro-de-sql.ts --marcar a.sql,b.sql --apply; Remove-Item Env:ALLOW_PROD_WRITE
 *   (en PowerShell, por `npx tsx`: se come el `--` y npm se queda con las banderas. Con `--marcar` el script lo nota y
 *   frena; con `--apply` no puede —npm no lo deja en ningún lado—, así que corre el simulacro y lo avisa al final)
 *
 * Mira cada `.sql` posterior al baseline que la base no tiene anotado y lo compara con el catálogo de Postgres
 * (lib/db/registro-de-sql.ts › pruebasDeLosArchivos):
 *   · DEMOSTRADO — todo lo que crea está (y lo que borra, no), y al menos una de esas pruebas es solo suya. Se anota con
 *     `como = demostrado`.
 *   · LE FALTA ALGO — no se anota: lo más probable es que no corrió. Se aplica con `npm run db:sql`.
 *   · SIN PRUEBA — cambia datos o permisos, o todo lo suyo lo crea también otro archivo: el esquema no puede decir si
 *     corrió. Lo anota una persona que sabe que corrió, con `--marcar` (`como = marcado`). `--marcar` solo acepta estos:
 *     con uno al que le falta algo se niega entero, porque el esquema dice que NO corrió.
 * Un demostrado que además cambia datos sale con «· cambia datos»: el esquema prueba su DDL, no su parte de datos.
 * La huella que se anota es la del archivo de HOY: si cambió desde que corrió, eso ya no se puede saber.
 *
 * Nunca pisa una fila que ya está (ON CONFLICT DO NOTHING): por eso no respalda la tabla. El destino es el
 * `DATABASE_URL` del `.env` (PRODUCCIÓN): `--apply` exige `ALLOW_PROD_WRITE=1` (scripts/lib/guard.ts, INV12), y en
 * producción lo corre la sesión que junta las ramas en main. El simulacro abre la conexión en solo lectura.
 */
import "dotenv/config";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createScriptPool } from "./lib/db";
import { assertProdWriteAllowed, describirDestino } from "./lib/guard";
import {
  SQL_DEL_REGISTRO,
  banderasQueSeQuedoNpm,
  cambiaDatos,
  clasificarConElCatalogo,
  esPosteriorAlBaseline,
  huellaDeSql,
  pruebasDeLosArchivos,
  type ArchivoSql,
  type VeredictoDelBackfill,
} from "../lib/db/registro-de-sql";
import { anotar, desdeEstaMaquina, existeElRegistro, leerCatalogoParaPruebas, leerRegistro } from "../lib/db/registro-de-sql-base";

const RAIZ = process.cwd();
const APPLY = process.argv.includes("--apply");
const COMANDO = "npm run db:sql:backfill";

/** `--marcar a.sql,b.sql` (o `--marcar=a.sql,b.sql`): nombres, con o sin `.sql`. */
function marcadosEnLaLinea(): string[] {
  const i = process.argv.findIndex((a) => a === "--marcar" || a.startsWith("--marcar="));
  if (i === -1) return [];
  const valor = process.argv[i].includes("=") ? process.argv[i].split("=").slice(1).join("=") : (process.argv[i + 1] ?? "");
  return valor
    .split(",")
    .map((s) => s.trim().replace(/^scripts[\\/]sql[\\/]/, ""))
    .filter(Boolean)
    .map((s) => (s.endsWith(".sql") ? s : `${s}.sql`));
}

function leerSql(ruta: string, nombre: string): ArchivoSql | null {
  return existsSync(ruta) ? { nombre, texto: readFileSync(ruta, "utf8") } : null;
}

async function main(): Promise<number> {
  const dir = join(RAIZ, "scripts", "sql");
  const posteriores: ArchivoSql[] = readdirSync(dir)
    .filter(esPosteriorAlBaseline)
    .sort()
    .map((nombre) => ({ nombre, texto: readFileSync(join(dir, nombre), "utf8") }));
  // Lo que pudo crear lo mismo por su cuenta: el baseline y la red de RLS. Sus pruebas no son de ningún archivo.
  const fondo = [
    leerSql(join(RAIZ, "prisma", "migrations", "0_init", "migration.sql"), "0_init/migration.sql"),
    leerSql(join(RAIZ, "prisma", "migrations", "0_init", "after.sql"), "0_init/after.sql"),
    leerSql(join(RAIZ, "prisma", "policies.sql"), "policies.sql"),
  ].filter((a): a is ArchivoSql => a !== null);

  const perdidas = banderasQueSeQuedoNpm(["--apply", "--marcar"], process.argv, process.env);
  if (perdidas.length > 0) {
    console.error(`✗ npm se quedó con ${perdidas.join(" y ")} y no le llegó al script (pasa en PowerShell, que se come el «--»). No se hizo nada.`);
    console.error("  Córrelo así: npx tsx scripts/registro-de-sql.ts [--marcar a.sql,b.sql] [--apply]");
    return 2;
  }
  const marcar = marcadosEnLaLinea();
  const nombres = new Set(posteriores.map((a) => a.nombre));
  const desconocidos = marcar.filter((m) => !nombres.has(m));
  if (desconocidos.length > 0) {
    console.error(`✗ --marcar: no son scripts/sql posteriores al baseline: ${desconocidos.join(", ")}. No se anotó nada.`);
    return 2;
  }

  if (APPLY) assertProdWriteAllowed(COMANDO);
  else process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on"].filter(Boolean).join(" ");
  const { pool, close } = createScriptPool();
  const cliente = await pool.connect();
  try {
    const hayRegistro = await existeElRegistro(cliente);
    if (!hayRegistro && APPLY) {
      console.error(`✗ La base no tiene el registro (SqlAplicado). Primero: npx tsx scripts/aplicar-sql.ts scripts/sql/${SQL_DEL_REGISTRO} --apply`);
      return 1;
    }
    const anotados = new Set((hayRegistro ? await leerRegistro(cliente) : []).map((f) => f.archivo));
    const catalogo = await leerCatalogoParaPruebas(cliente);
    const pruebas = pruebasDeLosArchivos(posteriores, fondo);

    const candidatos = posteriores.filter((a) => !anotados.has(a.nombre));
    const veredictos = new Map<string, VeredictoDelBackfill>(
      candidatos.map((a) => [a.nombre, clasificarConElCatalogo(pruebas.get(a.nombre) ?? [], catalogo)]),
    );
    const de = (estado: VeredictoDelBackfill["estado"]) => candidatos.filter((a) => veredictos.get(a.nombre)?.estado === estado);
    const demostrados = de("demostrado");
    const conFaltas = de("falta");
    const sinPrueba = de("sin-prueba");
    const aMarcar = candidatos.filter((a) => marcar.includes(a.nombre) && veredictos.get(a.nombre)?.estado === "sin-prueba");
    const yaAnotadosEnMarcar = marcar.filter((m) => anotados.has(m));
    // El esquema dice que estos NO corrieron: marcarlos los sacaría de check:esquema y lo que crean no se crearía nunca.
    const marcadosConFaltas = conFaltas.filter((a) => marcar.includes(a.nombre)).map((a) => a.nombre);
    if (marcadosConFaltas.length > 0) {
      console.error(
        `✗ --marcar: a ${marcadosConFaltas.join(", ")} le falta algo en la base, o sea que no corrió. No se anotó nada.\n` +
          "  Aplícalo con npx tsx scripts/aplicar-sql.ts <archivo> (simulacro) y después con --apply: queda anotado solo.",
      );
      return 1;
    }

    console.log(`\n${APPLY ? "BACKFILL" : "SIMULACRO del backfill"} en ${describirDestino(process.env.DATABASE_URL)}`);
    console.log(
      hayRegistro
        ? `  ${posteriores.length} scripts/sql posteriores al baseline; ${posteriores.length - candidatos.length} ya anotados; se miran ${candidatos.length}.`
        : `  La base todavía no tiene el registro: esto es lo que se anotaría una vez creado (${posteriores.length} archivos).`,
    );

    console.log(`\n✓ El esquema demuestra que corrieron (${demostrados.length}) → se anotan como «demostrado»:`);
    for (const a of demostrados) {
      const v = veredictos.get(a.nombre) as Extract<VeredictoDelBackfill, { estado: "demostrado" }>;
      const datos = cambiaDatos(a.texto) ? "   · cambia datos: el esquema prueba su DDL, no esa parte" : "";
      console.log(`    ${a.nombre}  (${v.pruebas} prueba${v.pruebas === 1 ? "" : "s"})${datos}`);
    }
    console.log(`\n✗ Les falta algo en la base (${conFaltas.length}) → NO se anotan; si no corrieron: npm run db:sql`);
    for (const a of conFaltas) {
      const v = veredictos.get(a.nombre) as Extract<VeredictoDelBackfill, { estado: "falta" }>;
      const muestra = v.faltan.slice(0, 3).join(", ") + (v.faltan.length > 3 ? ` y ${v.faltan.length - 3} más` : "");
      console.log(`    ${a.nombre}  — falta: ${muestra}`);
    }
    console.log(`\n· Sin prueba en el esquema (${sinPrueba.length}) → solo con --marcar, si sabes que corrieron:`);
    for (const a of sinPrueba) {
      const v = veredictos.get(a.nombre) as Extract<VeredictoDelBackfill, { estado: "sin-prueba" }>;
      console.log(`    ${a.nombre}  — ${v.motivo}${marcar.includes(a.nombre) ? "   → se marca" : ""}`);
    }
    if (yaAnotadosEnMarcar.length > 0) console.log(`\n  (--marcar: ya estaban anotados, no se tocan: ${yaAnotadosEnMarcar.join(", ")})`);
    if (aMarcar.length > 0) console.log(`\n✋ Se anotan como «marcado» (lo dices tú, no el esquema): ${aMarcar.map((a) => a.nombre).join(", ")}`);

    if (!APPLY) {
      console.log("\nNo se anotó nada. Para anotarlo: el mismo comando con --apply (y ALLOW_PROD_WRITE=1 si es producción).");
      if (process.env.npm_lifecycle_event) {
        console.log("(Si escribiste --apply y lo corriste con npm run desde PowerShell, npm se lo quedó: PowerShell se come el «--».");
        console.log(" Para anotar en PowerShell: npx tsx scripts/registro-de-sql.ts [--marcar …] --apply.)");
      }
      return 0;
    }
    const desde = desdeEstaMaquina(COMANDO);
    const nDemostrados = await anotar(
      cliente,
      demostrados.map((a) => ({ archivo: a.nombre, huella: huellaDeSql(a.texto) })),
      { desde, como: "demostrado", pisar: false },
    );
    const nMarcados = await anotar(
      cliente,
      aMarcar.map((a) => ({ archivo: a.nombre, huella: huellaDeSql(a.texto) })),
      { desde: `${desde} --marcar`, como: "marcado", pisar: false },
    );
    console.log(`\n✓ Anotados: ${nDemostrados} demostrados y ${nMarcados} marcados. \`npm run check:esquema\` dice lo que queda sin anotar.`);
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
