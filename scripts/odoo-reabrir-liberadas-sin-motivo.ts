/**
 * scripts/odoo-reabrir-liberadas-sin-motivo.ts — vuelve a abrir las facturas soltadas que se cerraron con «Ya está
 * anulada» SIN motivo, guardando antes quién y cuándo las había cerrado. Por defecto es un SIMULACRO: solo lee, y la
 * conexión es de solo lectura.
 *
 * Correr (PowerShell), en el orden de docs/RUNBOOK.md › Cobranza (SQL → deploy → este script):
 *   npx tsx scripts/odoo-reabrir-liberadas-sin-motivo.ts                   # simulacro
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/odoo-reabrir-liberadas-sin-motivo.ts --apply; Remove-Item Env:ALLOW_PROD_WRITE
 *
 * ── POR QUÉ ─────────────────────────────────────────────────────────────────────
 * Decisión de Elías (2026-09-25). Hasta ese día «Ya está anulada» no pedía motivo: la pantalla mandaba solo el id. Ese día
 * se cerraron así 4 facturas soltadas —Wherex cuotas 2 y 3, Honda Costa Rica cuota 5 y KAIZEN KAPITAL cuota 1, US$26.251—,
 * con quién y cuándo pero sin por qué. Se reabren: vuelven a la línea de facturas soltadas sin número, donde «Ya está
 * anulada» ahora pide el motivo. («Fue por Quickbooks», de KAIZEN, es el motivo de SOLTARLA, no el de cerrarla.)
 *
 * ── QUÉ HACE, POR FACTURA, EN UNA TRANSACCIÓN ───────────────────────────────────
 * Con `reabrirLiberacionTx`, la misma función que «Deshacer» en la pantalla:
 *   1. guarda quién y cuándo la había cerrado: una marca «Ya está anulada» con ese quién y ese cuándo, ya deshecha con la
 *      firma de Elías y el motivo «Reabierta por Elías el 2026-09-25: se cerró sin motivo»;
 *   2. limpia su cierre (`resueltaEn` y `resueltaPor`) y suma ese mismo texto al motivo de la factura soltada.
 *
 * ⛔ Solo las 4 decididas, por id. Si aparece otra cerrada sin motivo (`soltadasCerradasSinMotivo`, pura y con pruebas),
 *    se lista y NO se toca: esa decisión no se tomó.
 * ⛔ No toca cobros ni nada de Odoo. Nada de red.
 * ⛔ Idempotente: una ya reabierta no está cerrada, y no se vuelve a tocar.
 * ⚠ Con --apply hace falta la tabla de marcas (scripts/sql/2026-09-25-2-marcas-por-fila.sql), donde queda el rastro del
 *    cierre: sin ella aborta antes de escribir. El simulacro corre sin ella y lo dice.
 * ⚠ Después del deploy, no antes: con la pantalla vieja, una reabierta se podía volver a cerrar sin motivo.
 * Con --apply, además del respaldo con pg_dump del guard, deja un JSON con las filas tal como estaban en
 * `backups/<fecha>-odoo-reabrir-liberadas-sin-motivo/`.
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/db/prisma";
import { cargarEstadoDelCruce, liberacionParaCruzar } from "@/lib/cobranza/odoo/servicio";
import {
  detectarDiferenciasOdoo,
  montosPorMoneda,
  soltadasCerradasSinMotivo,
  textoDeLiberacion,
  textoDeMontos,
} from "@/lib/cobranza/odoo/diferencias";
import { MARCA_ANULADA, reabrirLiberacionTx } from "@/lib/cobranza/odoo/marcas";
import { describirDestino, nombreDelScript, planDeRespaldo, resolverApply } from "./lib/guard";

/**
 * Las 4 que decidió Elías (2026-09-25), por id de `FacturaLiberada`: medidas en producción ese día, en solo lectura,
 * todas cerradas por egonzalez entre las 11:37 y las 11:38 (hora de Costa Rica).
 */
const DECIDIDAS: ReadonlyMap<string, string> = new Map([
  ["cmtm5vvio000n07mpzxs2iipg", "Wherex cuota 2 · US$2.125"],
  ["cmtm5vvkn000o07mpwutxvy2r", "Wherex cuota 3 · US$2.125"],
  ["cmtuj373c008r07lgywvpg4wa", "Honda Costa Rica cuota 5 · US$500"],
  ["cmtwfb7d000ug07lg5sj7am16", "KAIZEN KAPITAL cuota 1 · US$21.501"],
]);
/** Quien decidió reabrirlas: firma el «Deshacer» de cada una. */
const DECIDIO = "egonzalez@smarteamcr.com";
/** El porqué de la reapertura: queda en la historia del cierre y en el motivo de la factura soltada. */
const MOTIVO = "Reabierta por Elías el 2026-09-25: se cerró sin motivo";

/** Lo que escribe: el guard las respalda con pg_dump antes de la primera escritura. */
const TABLAS = ["FacturaLiberada", "DiferenciaOdooMarca"];
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

/** Un JSON al lado del respaldo de pg_dump del guard: las filas tal como estaban. */
function guardarRespaldo(datos: unknown, ahora: Date): string {
  const { dir } = planDeRespaldo(TABLAS, { script: nombreDelScript(), ahora });
  mkdirSync(dir, { recursive: true });
  const p = (n: number) => String(n).padStart(2, "0");
  const ruta = join(dir, `respaldo.${p(ahora.getHours())}${p(ahora.getMinutes())}${p(ahora.getSeconds())}.json`);
  writeFileSync(ruta, JSON.stringify(datos, null, 2), "utf8");
  return ruta;
}

async function main() {
  const tabla = await existeLaTablaDeMarcas();
  if (QUIERE_ESCRIBIR && !tabla) {
    console.error("⛔ Falta la tabla de marcas: primero scripts/sql/2026-09-25-2-marcas-por-fila.sql (docs/RUNBOOK.md › Cobranza).");
    console.error("   Ahí queda quién y cuándo se habían cerrado: sin ella no se reabre nada. No se escribió nada.");
    process.exitCode = 1;
    return;
  }
  const apply = resolverApply({ tablas: TABLAS });

  console.log(`\nReabrir las facturas soltadas cerradas sin motivo${apply ? "" : "  (simulacro: solo lee)"}`);
  console.log(`  base: ${describirDestino(process.env.DATABASE_URL)}`);
  if (!tabla) console.log("  ⚠ La tabla de marcas todavía no existe en esta base: ninguna cerrada tiene su marca con el porqué.");

  const cerradas = await prisma.facturaLiberada.findMany({ where: { resueltaEn: { not: null } }, orderBy: [{ resueltaEn: "asc" }, { id: "asc" }] });
  const marcas = tabla
    ? await prisma.diferenciaOdooMarca.findMany({
        where: { tipo: MARCA_ANULADA, documento: { in: cerradas.map((l) => `l:${l.id}`) } },
        select: { id: true, documento: true, motivo: true, marcadaPor: true, marcadaEn: true, deshechaPor: true, deshechaEn: true },
      })
    : [];
  const sinMotivo = soltadasCerradasSinMotivo(cerradas, marcas);
  const aReabrir = sinMotivo.filter((l) => DECIDIDAS.has(l.id));
  const fuera = sinMotivo.filter((l) => !DECIDIDAS.has(l.id));
  const yaAbiertas = await prisma.facturaLiberada.findMany({ where: { id: { in: [...DECIDIDAS.keys()] }, resueltaEn: null }, select: { id: true } });
  const noExisten = [...DECIDIDAS.keys()].filter((id) => !cerradas.some((l) => l.id === id) && !yaAbiertas.some((l) => l.id === id));
  const decididasConMotivo = cerradas.filter((l) => DECIDIDAS.has(l.id) && !sinMotivo.includes(l));

  const monto = (l: (typeof cerradas)[number]) => ({ monto: Number(l.monto), moneda: l.moneda });
  console.log(`  Cerradas a mano: ${cerradas.length} · sin motivo: ${sinMotivo.length}.`);
  console.log(`\n  Se reabren (${aReabrir.length}, ${textoDeMontos(montosPorMoneda(aReabrir.map(monto)))}):`);
  for (const l of aReabrir) {
    console.log(
      `    · ${textoDeLiberacion({ clienteNombre: l.clienteNombre, ...monto(l) })} · cuota ${l.numCuota ?? "?"} · ${l.referenciaExterna ?? "sin número"} · ` +
        `cerrada por ${l.resueltaPor ?? "(sin firma)"} el ${l.resueltaEn ? horaCR(l.resueltaEn) : "?"}` +
        (l.motivo ? ` · motivo de soltarla: «${l.motivo}»` : ""),
    );
  }
  if (fuera.length) {
    console.log(`\n  ⚠ Cerradas sin motivo FUERA de la decisión de Elías: NO se tocan (${fuera.length}):`);
    for (const l of fuera) console.log(`    · ${l.id} · ${textoDeLiberacion({ clienteNombre: l.clienteNombre, ...monto(l) })} · cuota ${l.numCuota ?? "?"}`);
  }
  if (yaAbiertas.length) console.log(`\n  Ya estaban abiertas (reabiertas antes): ${yaAbiertas.map((l) => DECIDIDAS.get(l.id)).join(", ")}.`);
  if (decididasConMotivo.length) {
    console.log(`\n  ⚠ Decididas que hoy tienen motivo de cierre: no se tocan (${decididasConMotivo.map((l) => DECIDIDAS.get(l.id)).join(", ")}).`);
  }
  if (noExisten.length) console.log(`\n  ⚠ Decididas que ya no existen: ${noExisten.map((id) => DECIDIDAS.get(id)).join(", ")}.`);

  /* Dónde vuelven a aparecer: la lista con estas facturas abiertas, armada por el mismo motor que la pantalla. */
  const { estado } = await cargarEstadoDelCruce({ sinMarcas: !tabla });
  const ids = new Set(aReabrir.map((l) => `l:${l.id}`));
  const lineas = detectarDiferenciasOdoo({
    ...estado,
    liberaciones: [...estado.liberaciones, ...aReabrir.map((l) => ({ ...liberacionParaCruzar(l), resuelta: false }))],
  });
  for (const l of lineas) {
    const vuelven = l.items.filter((i) => i.fila.documentos.some((d) => ids.has(d.clave)));
    if (!vuelven.length) continue;
    console.log(`\n  Vuelven a «${l.titulo}» (${l.codigo}), con «${l.accionPorItem?.etiqueta ?? "sin botón"}» por fila:`);
    for (const i of vuelven) console.log(`    · ${i.texto}${i.nota ? ` — ${i.nota}` : ""}`);
  }

  if (!apply) {
    console.log('\n(no se escribió nada. Para escribir: $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/odoo-reabrir-liberadas-sin-motivo.ts --apply)');
    return;
  }
  if (!aReabrir.length) {
    console.log("\n  Nada que reabrir.");
    return;
  }

  const ahora = new Date();
  const ruta = guardarRespaldo(
    {
      script: nombreDelScript(),
      guardadoEn: ahora.toISOString(),
      base: describirDestino(process.env.DATABASE_URL),
      decidio: DECIDIO,
      motivo: MOTIVO,
      facturasSoltadasAntes: aReabrir,
      marcasAnuladasAntes: marcas.filter((m) => aReabrir.some((l) => m.documento === `l:${l.id}`)),
    },
    ahora,
  );
  console.log(`\n  respaldo antes de escribir: ${ruta}`);

  /* Una transacción por factura: si se corta a mitad, lo hecho queda bien hecho y volver a correrlo sigue desde ahí. */
  for (const l of aReabrir) {
    const r = await prisma.$transaction((tx) => reabrirLiberacionTx(tx, { liberacionId: l.id, actor: DECIDIO, en: ahora, motivo: MOTIVO }));
    console.log(`  · ${DECIDIDAS.get(l.id)}: ${r === "REABIERTA" ? "reabierta" : r === "YA_ESTABA_ABIERTA" ? "ya estaba abierta" : "ya no existe"}`);
  }
  const siguenCerradas = await prisma.facturaLiberada.count({ where: { id: { in: aReabrir.map((l) => l.id) }, resueltaEn: { not: null } } });
  console.log(`\n  Siguen cerradas: ${siguenCerradas}${siguenCerradas ? " ⚠ vuelve a correrlo y mira el error" : " ✓"}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
