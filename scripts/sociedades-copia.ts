/**
 * scripts/sociedades-copia.ts — lee de Odoo lo que se deben las sociedades de Smarteam y, con --apply, lo copia a
 * `MovimientoEntreSociedades` (2026-11-13). La copia de Odoo de cada hora hace lo mismo sola; esto sirve para la
 * primera carga y para mirar sin esperar.
 *
 *   Simulacro (solo lee Odoo y la base):  npx tsx scripts/sociedades-copia.ts
 *   Aplicar:                              ALLOW_PROD_WRITE=1 npx tsx scripts/sociedades-copia.ts --apply
 *
 * ⛔ Solo lectura hacia Odoo. Escribe solo `MovimientoEntreSociedades` (y su resultado en `CronJobState`).
 * Requiere el SQL scripts/sql/2026-11-13-sociedades-de-smarteam.sql aplicado.
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { prisma } from "@/lib/db/prisma";
import { crearTransporteXmlRpc, configDesdeEntorno } from "@/lib/cobranza/odoo/transporte-xmlrpc";
import { cargarSociedades, copiarEntreSociedades, leerLibrosDeOdoo, leerMovimientosDeOdoo } from "@/lib/sociedades/copia";
import { saldosEntreSociedades } from "@/lib/sociedades/entre-sociedades";
import { resolverApply, imprimirDestino } from "./lib/guard";

async function main() {
  imprimirDestino("db");
  const apply = resolverApply({ tablas: ["MovimientoEntreSociedades"] });
  const t = crearTransporteXmlRpc(configDesdeEntorno());

  if (apply) {
    const r = await copiarEntreSociedades(t, new Date());
    console.log(`[sociedades] ${r.ok ? "OK" : "FALLÓ"}: ${r.vistas} vistas · ${r.nuevas} nuevas · ${r.cambiadas} con cambios · ${r.desaparecidas} desaparecidas`);
    for (const a of r.avisos) console.log(`  ⚠ ${a}`);
    if (r.error) console.error(`  ⛔ ${r.error}`);
    return;
  }

  const sociedades = await cargarSociedades();
  const nombre = new Map(sociedades.map((s) => [s.id, s.nombre]));
  const libros = await leerLibrosDeOdoo(t, sociedades);
  const { movimientos, rechazadas, avisos } = await leerMovimientosDeOdoo(t, libros);
  const ya = new Set((await prisma.movimientoEntreSociedades.findMany({ where: { origen: "ODOO" }, select: { odooLineId: true } })).map((m) => m.odooLineId));
  console.log(`[simulacro] Odoo trae ${movimientos.length} movimientos (${movimientos.filter((m) => !ya.has(m.odooLineId)).length} nuevos para la base).`);
  console.log(`  entre sociedades sin factura: ${movimientos.filter((m) => m.contraparteId && m.respaldo === "SIN_RESPALDO").length}`);
  console.log(`  traslados propios sin su otra mitad: ${movimientos.filter((m) => !m.contraparteId && m.respaldo === "SIN_RESPALDO").length}`);
  for (const s of saldosEntreSociedades(movimientos.map((m) => ({ ...m, estado: "VIGENTE" })))) {
    console.log(`  ${nombre.get(s.deudoraId)} le debe a ${nombre.get(s.acreedoraId)}: ${s.saldo.toLocaleString("es-CR")} ${s.moneda} (${s.movimientos} movimientos)`);
  }
  for (const a of [...libros.avisos, ...avisos]) console.log(`  ⚠ ${a}`);
  if (rechazadas.length) console.log(`  ⚠ ${rechazadas.length} líneas que no se pudieron leer: ${rechazadas.slice(0, 5).join(" | ")}`);
  console.log("Para escribir: ALLOW_PROD_WRITE=1 npx tsx scripts/sociedades-copia.ts --apply");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
