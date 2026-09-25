/**
 * scripts/odoo-traspasar-marcas-de-notas.ts — pasa la marca de GRUPO de «notas de crédito sin aplicar»
 * (`DiferenciaOdooAceptada`, clave ODOO-NOTA-SIN-APLICAR) a una marca «está bien así» por nota, con el mismo motivo, la
 * misma persona y la misma fecha. Por defecto es un SIMULACRO: solo lee, y la conexión es de solo lectura.
 *
 * Correr (PowerShell), en el orden de docs/RUNBOOK.md › Cobranza (SQL → deploy → este script):
 *   npx tsx scripts/odoo-traspasar-marcas-de-notas.ts                   # simulacro
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/odoo-traspasar-marcas-de-notas.ts --apply; Remove-Item Env:ALLOW_PROD_WRITE
 *
 * ── POR QUÉ ─────────────────────────────────────────────────────────────────────
 * Decisión de Elías (2026-09-25). Ese día «Está bien así» pasó de ser por grupo a ser por fila, y la pantalla dejó de leer
 * la marca de grupo. La única que existía —15 notas de crédito, US$27.577,66 + ₡889, marcadas por egonzalez ese mismo
 * día— tiene que seguir marcada, ahora nota por nota: así se ve en «Marcadas» y se deshace de a una. Hasta que corra
 * este script, esas 15 notas vuelven a la lista.
 *
 * ── QUÉ HACE ────────────────────────────────────────────────────────────────────
 * Recalcula la línea con el mismo motor que la pantalla (`cargarEstadoDelCruce` + `detectarDiferenciasOdoo`) y compara
 * cada nota con lo que se MARCÓ (`decidirTraspasoDeGrupo`, puro y con pruebas): la que sigue igual recibe su marca con
 * `marcarFilasTx`, la misma función del botón; la que cambió desde entonces no se marca y se lista, para que alguien la
 * mire. No depende del sync: compara contra la huella guardada, que el sync no toca.
 *
 * ⛔ No borra la marca de grupo: queda como historia. No toca notas, facturas ni cobros: solo agrega marcas. Nada de red.
 * ⛔ Idempotente: una nota que ya recibió su marca de traspaso (mismo motivo, persona y fecha), vigente o deshecha, no se
 *    vuelve a marcar. Correrlo dos veces no escribe nada la segunda, y no pisa un «Deshacer».
 * ⚠ Con --apply hace falta la tabla de marcas (scripts/sql/2026-09-25-2-marcas-por-fila.sql): sin ella aborta antes de
 *    escribir. El simulacro corre sin ella y lo dice (simula con 0 marcas por fila).
 * ⚠ Las fechas se leen y se escriben con Prisma. La columna es `timestamp` sin zona: un lector con `pg` crudo la corre
 *    6 horas, y el «cuándo» de las marcas quedaría mal.
 * Con --apply, además del respaldo con pg_dump del guard, deja un JSON con lo que había y lo que escribe en
 * `backups/<fecha>-odoo-traspasar-marcas-de-notas/`.
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/db/prisma";
import { cargarEstadoDelCruce } from "@/lib/cobranza/odoo/servicio";
import {
  decidirTraspasoDeGrupo,
  detectarDiferenciasOdoo,
  montosPorMoneda,
  textoDeMontos,
  type DiferenciaOdoo,
} from "@/lib/cobranza/odoo/diferencias";
import { MARCA_BIEN_ASI, marcarFilasTx } from "@/lib/cobranza/odoo/marcas";
import { describirDestino, nombreDelScript, planDeRespaldo, resolverApply } from "./lib/guard";

const LINEA = "ODOO-NOTA-SIN-APLICAR";
/** Lo único que escribe: el guard la respalda con pg_dump antes de la primera escritura. */
const TABLAS = ["DiferenciaOdooMarca"];
const QUIERE_ESCRIBIR = process.argv.includes("--apply");

/* ⛔ El simulacro no puede escribir ni por error: la conexión nace de solo lectura y Postgres rechaza cualquier escritura.
   `pg` lee PGOPTIONS al abrir cada conexión, y la primera se abre con la primera consulta, más abajo. */
if (!QUIERE_ESCRIBIR) {
  process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=20000"]
    .filter(Boolean)
    .join(" ");
}

const horaCR = (d: Date) =>
  d.toLocaleString("es-CR", { timeZone: "America/Costa_Rica", dateStyle: "medium", timeStyle: "medium" });

async function existeLaTablaDeMarcas(): Promise<boolean> {
  const [r] = await prisma.$queryRaw<Array<{ existe: boolean }>>`SELECT to_regclass('public."DiferenciaOdooMarca"') IS NOT NULL AS existe`;
  return r?.existe === true;
}

/** Un JSON al lado del respaldo de pg_dump del guard: lo que había y lo que se va a escribir. */
function guardarRespaldo(datos: unknown, ahora: Date): string {
  const { dir } = planDeRespaldo(TABLAS, { script: nombreDelScript(), ahora });
  mkdirSync(dir, { recursive: true });
  const p = (n: number) => String(n).padStart(2, "0");
  const ruta = join(dir, `respaldo.${p(ahora.getHours())}${p(ahora.getMinutes())}${p(ahora.getSeconds())}.json`);
  writeFileSync(ruta, JSON.stringify(datos, null, 2), "utf8");
  return ruta;
}

function imprimir(titulo: string, filas: ReadonlyArray<{ texto: string }>): void {
  if (!filas.length) return;
  console.log(`\n  ${titulo} (${filas.length}):`);
  for (const f of filas) console.log(`    · ${f.texto}`);
}

const contarLinea = (l: DiferenciaOdoo | undefined) =>
  l ? `${l.items.length} pendiente(s) y ${l.marcadas.length} marcada(s)` : "no está: no hay notas sin aplicar";

async function main() {
  const tabla = await existeLaTablaDeMarcas();
  if (QUIERE_ESCRIBIR && !tabla) {
    console.error("⛔ Falta la tabla de marcas: primero scripts/sql/2026-09-25-2-marcas-por-fila.sql (docs/RUNBOOK.md › Cobranza).");
    console.error("   No se escribió nada.");
    process.exitCode = 1;
    return;
  }
  const apply = resolverApply({ tablas: TABLAS });

  console.log(`\nTraspaso de la marca de grupo de «notas de crédito sin aplicar»${apply ? "" : "  (simulacro: solo lee)"}`);
  console.log(`  base: ${describirDestino(process.env.DATABASE_URL)}`);
  if (!tabla) console.log("  ⚠ La tabla de marcas todavía no existe en esta base: se simula con 0 marcas por fila.");

  const grupo = await prisma.diferenciaOdooAceptada.findUnique({ where: { clave: LINEA } });
  const otras = await prisma.diferenciaOdooAceptada.count({ where: { clave: { not: LINEA } } });
  if (otras) console.log(`  ⚠ Hay ${otras} marca(s) de grupo de otras líneas: no se traspasan (la decisión es solo sobre las notas).`);
  if (!grupo) {
    console.log("  No hay marca de grupo de las notas: nada que traspasar.");
    return;
  }
  console.log(`  Marca de grupo: «${grupo.motivo}» · ${grupo.aceptadaPor} · ${horaCR(grupo.aceptadaEn)} (hora de Costa Rica)`);

  /* Las marcas que ya dejó un traspaso anterior: mismo motivo, persona y fecha, vigentes o deshechas. */
  const firma = { tipo: MARCA_BIEN_ASI, linea: LINEA, motivo: grupo.motivo, marcadaPor: grupo.aceptadaPor, marcadaEn: grupo.aceptadaEn };
  const yaTraspasadas = tabla
    ? await prisma.diferenciaOdooMarca.findMany({ where: firma, select: { id: true, documento: true, deshechaEn: true } })
    : [];

  const { estado } = await cargarEstadoDelCruce({ sinMarcas: !tabla });
  const linea = detectarDiferenciasOdoo(estado).find((l) => l.codigo === LINEA);
  const t = decidirTraspasoDeGrupo(linea, grupo.huella, estado.marcas, new Set(yaTraspasadas.map((m) => m.documento)));

  const porClave = new Map((linea?.items ?? []).map((i) => [i.fila.clave, i]));
  const aMarcar = t.aMarcar.map((f) => ({ ...f, monto: porClave.get(f.fila)?.monto ?? 0, moneda: porClave.get(f.fila)?.moneda ?? "?" }));
  const documentos = aMarcar.reduce((n, f) => n + f.documentos.length, 0);

  console.log(`  La línea hoy: ${contarLinea(linea)}.`);
  imprimir(`Se marcan, una por nota (${textoDeMontos(montosPorMoneda(aMarcar))})`, aMarcar);
  imprimir("⚠ Cambiaron desde la marca de grupo: NO se marcan y quedan en la lista", t.cambiaron);
  imprimir("Ya marcadas a mano por alguien: no se marcan dos veces", t.yaMarcadas);
  imprimir("Ya traspasadas en una corrida anterior (o deshechas después): no se tocan", t.yaTraspasadas);
  imprimir(
    "Lo que decía la marca de grupo y hoy no está igual en la línea",
    t.noEstan.map((texto) => ({ texto })),
  );
  console.log(`\n  Resumen: ${aMarcar.length} nota(s) a marcar (${documentos} marca(s)) · ${t.cambiaron.length} cambiaron · ${t.yaMarcadas.length} ya marcadas · ${t.yaTraspasadas.length} ya traspasadas.`);

  if (!apply) {
    console.log('\n(no se escribió nada. Para escribir: $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/odoo-traspasar-marcas-de-notas.ts --apply)');
    return;
  }
  if (!aMarcar.length) {
    console.log("\n  Nada que escribir.");
    return;
  }

  const ahora = new Date();
  const ruta = guardarRespaldo(
    {
      script: nombreDelScript(),
      guardadoEn: ahora.toISOString(),
      base: describirDestino(process.env.DATABASE_URL),
      marcaDeGrupo: grupo,
      marcasDeLaLineaAntes: await prisma.diferenciaOdooMarca.findMany({ where: { linea: LINEA }, orderBy: { marcadaEn: "asc" } }),
      aEscribir: { ...firma, filas: t.aMarcar },
    },
    ahora,
  );
  console.log(`\n  respaldo antes de escribir: ${ruta}`);

  /* ⭐ Con la persona y la fecha de la marca de grupo: es su decisión, del momento en que la tomó. */
  const escritas = await prisma.$transaction((tx) =>
    marcarFilasTx(tx, { linea: LINEA, motivo: grupo.motivo, actor: grupo.aceptadaPor, en: grupo.aceptadaEn, filas: t.aMarcar }),
  );
  const despues = detectarDiferenciasOdoo((await cargarEstadoDelCruce()).estado).find((l) => l.codigo === LINEA);
  console.log(`  escritas: ${escritas} marca(s). La línea queda con ${contarLinea(despues)}.`);
  console.log("  La marca de grupo sigue en DiferenciaOdooAceptada, como historia.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
