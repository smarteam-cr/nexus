/**
 * scripts/ordenar-lo-que-no-cuadra.ts — lo que Nexus ordena solo en «Lo que no cuadra» (2026-10-22).
 *
 * Lo mismo que corre cada hora con el cobro de lo pagado (lib/cobranza/libro/ordenar-server.ts), a mano: para ver qué
 * ordenaría hoy antes de que lo haga el job, o para ordenarlo ya. Las reglas: lib/cobranza/libro/ordenar.ts.
 *
 * ⛔ POR DEFECTO ES UN SIMULACRO: la base se abre en solo lectura y se imprime lo que haría. Para escribir: `--apply` y
 * `ALLOW_PROD_WRITE=1`. Lo escrito lleva la firma del sistema de su fuente, queda en `OrdenDelSistema` y se deshace
 * desde Conciliación › «Lo que no cuadra» › «Nexus ordenó solo». ⛔ Nada de esto escribe en Odoo ni en Mercury.
 *
 * Uso (PowerShell, en la carpeta del proyecto):
 *   npx tsx scripts/ordenar-lo-que-no-cuadra.ts
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/ordenar-lo-que-no-cuadra.ts --apply
 */
import "dotenv/config";
import "./lib/permitir-server-only";

const QUIERE_ESCRIBIR = process.argv.includes("--apply");
if (!QUIERE_ESCRIBIR) {
  process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=60000"].filter(Boolean).join(" ");
}

async function main() {
  const { prisma } = await import("@/lib/db/prisma");
  const { crDateParts } = await import("@/lib/jobs/time");
  const { ordenarLoSeguro } = await import("@/lib/cobranza/libro/ordenar-server");
  const { describirDestino, resolverApply } = await import("./lib/guard");

  const APPLY = resolverApply({ tablas: ["Cobro", "BitacoraCobro", "OrdenDelSistema"] });
  if (APPLY !== QUIERE_ESCRIBIR) throw new Error("--apply y el guard no dicen lo mismo: no se escribe nada.");
  console.log(`Base: ${describirDestino(process.env.DATABASE_URL)} · ${APPLY ? "APLICAR" : "SIMULACRO (no escribe)"}`);

  const r = await ordenarLoSeguro({ aplicar: APPLY, hoy: crDateParts(new Date()).dateKey });
  const porRegla = new Map<string, number>();
  for (const o of r.ordenes) porRegla.set(o.regla, (porRegla.get(o.regla) ?? 0) + 1);
  const cuotas = r.ordenes.reduce((n, o) => n + o.cuotas.length, 0);
  console.log(`\nSe ordenan ${r.ordenes.length} facturas en ${cuotas} cuotas: ${[...porRegla].map(([k, v]) => `${k} ${v}`).join(" · ") || "ninguna"}`);
  for (const o of r.ordenes) {
    const conMonto = o.cuotas.filter((c) => c.montoDespues !== undefined).length;
    console.log(`  · [${o.regla}] ${o.texto}${conMonto ? ` (monto en ${conMonto})` : ""}`);
  }
  console.log(`\nQuedan para una persona: ${r.dudosas.length}`);
  for (const d of r.dudosas) console.log(`  · ${d.cuenta}: ${d.texto}`);
  if (APPLY) {
    console.log(`\nEscritas: ${r.escritas} · saltadas: ${r.saltadas.length}`);
    for (const s of r.saltadas) console.log(`  · ${s.cuenta} ${s.numero}: ${s.motivo}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
