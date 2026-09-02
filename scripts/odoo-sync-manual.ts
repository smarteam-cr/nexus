/**
 * scripts/odoo-sync-manual.ts — corre el espejo de Odoo a mano.
 *
 * Correr: `npx tsx scripts/odoo-sync-manual.ts`
 *
 * ⛔ Solo lectura hacia Odoo. Escribe en `FacturaOdoo` y su bitácora, y en NINGÚN `Cobro`.
 * Existe para diagnosticar sin esperar al tick de las 6 y para la primera carga.
 */
import "dotenv/config";
import { prisma } from "@/lib/db/prisma";
import { sincronizarOdoo } from "@/lib/cobranza/odoo/sync";

async function main() {
  const r = await sincronizarOdoo({ disparadaPor: `manual:${process.env.USER ?? "script"}` });
  console.log(`[sync] corrida ${r.corridaId} — ${r.ok ? "OK" : "FALLÓ"}${r.parcial ? " (PARCIAL)" : ""} en ${r.duracionMs} ms`);
  console.log(`  facturas vistas : ${r.facturasVistas}`);
  console.log(`  nuevas          : ${r.creadas}`);
  console.log(`  actualizadas    : ${r.actualizadas} (${r.cambios} cambios anotados)`);
  console.log(`  desaparecidas   : ${r.desaparecidas}`);
  console.log(`  sin cuenta      : ${r.sinCuenta}`);
  console.log(`  movidas desde la última corrida: ${r.movidasDesdeLaUltima ?? "(primera)"}`);
  if (r.rechazadas.length) {
    console.log(`  ⚠ ${r.rechazadas.length} rechazadas:`);
    for (const x of r.rechazadas.slice(0, 20)) console.log(`     · ${x}`);
  }
  if (r.error) console.error(`  ⛔ ${r.error}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
