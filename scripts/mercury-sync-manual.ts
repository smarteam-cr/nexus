/**
 * scripts/mercury-sync-manual.ts — corre la copia de Mercury a mano.
 *
 * Correr: `npx tsx scripts/mercury-sync-manual.ts` (necesita MERCURY_API_TOKEN en el .env).
 *
 * ⛔ Solo lectura hacia Mercury (el token no puede escribir). Escribe en las tablas de la copia —`FacturaMercury`,
 * `ClienteMercury`, `MovimientoMercury`, `SyncMercuryCorrida`— y en NINGÚN `Cobro`. Es lo mismo que hace la copia de
 * la mañana y el botón «Actualizar desde Mercury»: existe para diagnosticar y para la primera carga.
 */
import "dotenv/config";
import { prisma } from "@/lib/db/prisma";
import { sincronizarMercury } from "@/lib/cobranza/mercury/sync";
import { describirDestino } from "./lib/guard";

async function main() {
  console.log(`Base: ${describirDestino(process.env.DATABASE_URL)}`);
  const r = await sincronizarMercury({ disparadaPor: `manual:${process.env.USERNAME ?? process.env.USER ?? "script"}` });
  if (r.enCurso) {
    console.log("Ya hay una copia de Mercury en curso: no se hizo nada.");
    return;
  }
  console.log(`[mercury] corrida ${r.corridaId} — ${r.ok ? "OK" : "FALLÓ"}${r.parcial ? " (PARCIAL)" : ""} en ${r.duracionMs} ms`);
  console.log(`  facturas vistas    : ${r.facturasVistas} (${r.creadas} nuevas, ${r.actualizadas} con cambios, ${r.desaparecidas} desaparecidas)`);
  console.log(`  clientes vistos    : ${r.clientesVistos} (${r.clientesNuevos} nuevos)`);
  console.log(`  movimientos vistos : ${r.movimientosVistos} (${r.movimientosNuevos} nuevos)`);
  if (r.rechazadas.length) {
    console.log(`  ⚠ ${r.rechazadas.length} facturas no se pudieron leer:`);
    for (const x of r.rechazadas.slice(0, 20)) console.log(`     · ${x}`);
  }
  if (r.error) console.error(`  ⛔ ${r.error}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
