/**
 * scripts/aplicar-odoo-y-mercury.ts — «Odoo y Mercury mandan» (plan «Un solo libro financiero», 2026-10-16).
 *
 * Pone en Nexus lo que Odoo y Mercury ya dicen: cada cuota se queda con su factura (queda facturada, con el número) y,
 * si quien firma lo pide, las que están pagadas allá quedan cobradas con el día real del pago. Qué se escribe lo
 * decide lib/cobranza/libro/hechos.ts (puro, con pruebas); la escritura va por `cambiarEstadoCobroTx`.
 *
 * Los choques (cobrada en Nexus, impaga allá) NO se tocan: se listan, y quedan en «Lo que no cuadra» para María José.
 *
 * ⛔ POR DEFECTO ES UN SIMULACRO: la base se abre en solo lectura, Odoo se lee (siempre es solo lectura) y se imprime
 * lo que haría. Para escribir: `--apply`, `--firma=<correo del equipo>` y `ALLOW_PROD_WRITE=1`.
 * `--cobrar`: además cobra las pagadas, confirmadas por quien firma (INV3). Sin esa bandera solo pega facturas.
 * ⛔ Nada de esto escribe en Odoo ni en Mercury.
 *
 * Uso (PowerShell, en la carpeta del proyecto):
 *   npx tsx scripts/aplicar-odoo-y-mercury.ts
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/aplicar-odoo-y-mercury.ts --firma=<correo> --cobrar --apply
 *
 * Correrlo dos veces no cambia nada: lo ya pegado o cobrado no vuelve a salir. El detalle queda en
 * `backups/<AAAA-MM-DD>-aplicar-odoo-y-mercury/` (fuera de git).
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const QUIERE_ESCRIBIR = process.argv.includes("--apply");
if (!QUIERE_ESCRIBIR) {
  process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=60000"].filter(Boolean).join(" ");
}
const COBRAR = process.argv.includes("--cobrar");
const firma = process.argv.find((a) => a.startsWith("--firma="))?.slice(8) ?? "";

const plata = (xs: ReadonlyArray<{ monto: number; moneda: string }>) => {
  const t = new Map<string, number>();
  for (const x of xs) t.set(x.moneda, (t.get(x.moneda) ?? 0) + x.monto);
  return [...t].map(([m, v]) => `${m} ${v.toLocaleString("es-CR", { maximumFractionDigits: 2 })}`).join(" + ") || "—";
};

async function main() {
  const { prisma } = await import("@/lib/db/prisma");
  const { crDateParts } = await import("@/lib/jobs/time");
  const { crearTransporteXmlRpc, configDesdeEntorno } = await import("@/lib/cobranza/odoo/transporte-xmlrpc");
  const { aplicarLoQueDicenOdooYMercury } = await import("@/lib/cobranza/libro/aplicar");
  const { describirDestino, resolverApply } = await import("./lib/guard");

  const APPLY = resolverApply({ tablas: ["Cobro", "BitacoraCobro", "AlertaCobro"] });
  if (APPLY !== QUIERE_ESCRIBIR) throw new Error("--apply y el guard no dicen lo mismo: no se escribe nada.");
  if (APPLY && !firma) throw new Error("Falta --firma=<correo del equipo>: lo que se escribe lleva la firma de una persona.");
  console.log(`Base: ${describirDestino(process.env.DATABASE_URL)} · ${APPLY ? (COBRAR ? "APLICAR Y COBRAR" : "APLICAR (solo pegar facturas)") : "SIMULACRO (no escribe)"}`);

  const hoy = crDateParts(new Date()).dateKey;
  const odoo = process.env.ODOO_PASSWORD ? crearTransporteXmlRpc(configDesdeEntorno()) : null;
  if (!odoo) console.log("⚠ Sin ODOO_PASSWORD: no se puede leer el día de los pagos de Odoo; esas cuotas no se cobran.");
  const r = await aplicarLoQueDicenOdooYMercury({ aplicar: APPLY, cobrar: COBRAR, firma, hoy, odoo });

  const pegar = r.acciones.filter((a) => a.fechaEmision || a.numeroFactura);
  const cobrar = r.acciones.filter((a) => a.cobrar);
  console.log(`\n1 · Se pegan a su factura: ${pegar.length} cuotas · ${plata(pegar)}`);
  for (const a of pegar) console.log(`   ${a.cuenta} · ${a.periodo} · ${a.moneda} ${a.monto} → ${a.numero}${a.fechaEmision ? " (queda facturada)" : ""}`);
  console.log(`\n2 · Pagadas allá, para cobrar: ${cobrar.length} cuotas · ${plata(cobrar)}${COBRAR ? "" : "  (sin --cobrar no se cobran)"}`);
  for (const a of cobrar) console.log(`   ${a.cuenta} · ${a.periodo} · ${a.moneda} ${a.monto} · ${a.numero} → cobrada el ${a.cobrar!.fechaCobro} (${a.cobrar!.deDonde})`);
  if (r.pagadasSinFecha.length) {
    console.log(`\n   ⚠ Pagadas sin el día del pago (no se cobran): ${r.pagadasSinFecha.length}`);
    for (const p of r.pagadasSinFecha) console.log(`   ${p.cuenta} · ${p.periodo} · ${p.numero}`);
  }
  console.log(`\n3 · Choques, NO se tocan (cobradas en Nexus, impagas allá): ${r.choques.length} · ${plata(r.choques)}`);
  for (const p of r.choques) console.log(`   ${p.cuenta} · ${p.periodo} · ${p.moneda} ${p.monto} · ${p.numero}`);

  if (APPLY) {
    console.log(`\n✓ Escritas: ${r.escritas}. Saltadas: ${r.saltadas.length}.`);
    for (const s of r.saltadas) console.log(`   ${s.cuenta}: ${s.motivo}`);
  } else {
    console.log("\nSimulacro: no se escribió nada. Para aplicar: ALLOW_PROD_WRITE=1, --firma=<correo>, --apply (y --cobrar para cobrar las pagadas).");
  }
  const carpeta = join("backups", `${hoy}-aplicar-odoo-y-mercury`);
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, `${new Date().toISOString().replace(/[:.]/g, "-")}-${APPLY ? "aplicado" : "simulacro"}.json`), JSON.stringify(r, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? `\n✗ ${e.message}` : e);
  process.exitCode = 1;
});
