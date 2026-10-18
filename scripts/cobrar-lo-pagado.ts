/**
 * scripts/cobrar-lo-pagado.ts — el cobro solo de lo pagado en Odoo y Mercury, a mano (2026-10-18).
 *
 * Lo mismo que hace cada mañana el job `lo-pagado-daily`: cobra lo que Odoo y Mercury dan por pagado y conciliado con
 * el banco, firmado por el sistema (`sistema:odoo`, `sistema:mercury`), por `cambiarEstadoCobroTx` y con su bitácora.
 * La regla vive en lib/cobranza/libro/hechos.ts (`paraCobrarSolo`); el turno, en lib/cobranza/libro/turno.ts.
 *
 * ⛔ POR DEFECTO ES UN SIMULACRO: la base se abre en solo lectura, Odoo se lee (siempre es solo lectura) y se imprime lo
 * que se cobraría, por moneda, sin sumar monedas. No mira la hora: el simulacro corre a cualquier hora, con las copias
 * que corrieron bien hoy (una atrasada se dice y lo suyo no se cobra).
 * Para escribir: `--apply` y `ALLOW_PROD_WRITE=1` (respalda Cobro, BitacoraCobro y AlertaCobro antes).
 * ⛔ Nada de esto escribe en Odoo ni en Mercury.
 *
 * Uso (PowerShell, en la carpeta del proyecto):
 *   npx tsx scripts/cobrar-lo-pagado.ts
 */
import "dotenv/config";
import "./lib/permitir-server-only";

const QUIERE_ESCRIBIR = process.argv.includes("--apply");
if (!QUIERE_ESCRIBIR) {
  process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=60000"].filter(Boolean).join(" ");
}

const plata = (xs: ReadonlyArray<{ monto: number; moneda: string }>) => {
  const t = new Map<string, number>();
  for (const x of xs) t.set(x.moneda, Math.round(((t.get(x.moneda) ?? 0) + x.monto) * 100) / 100);
  return [...t].map(([m, v]) => `${m} ${v.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`).join(" + ") || "—";
};

async function main() {
  const { prisma } = await import("@/lib/db/prisma");
  const { correrElCobroDelDia } = await import("@/lib/cobranza/libro/servicio");
  const { describirDestino, resolverApply } = await import("./lib/guard");

  const APPLY = resolverApply({ tablas: ["Cobro", "BitacoraCobro", "AlertaCobro"] });
  if (APPLY !== QUIERE_ESCRIBIR) throw new Error("--apply y el guard no dicen lo mismo: no se escribe nada.");
  console.log(`Base: ${describirDestino(process.env.DATABASE_URL)} · ${APPLY ? "COBRAR (firma del sistema)" : "SIMULACRO (no escribe)"}`);

  const { turno, resultado } = await correrElCobroDelDia(new Date(), { aplicar: APPLY, ignorarLaHora: true });
  console.log(`Copias al día hoy: ${turno.fuentes.join(" y ") || "ninguna"}${turno.atrasadas.length ? ` · atrasadas: ${turno.atrasadas.join(" y ")}` : ""}`);
  if (!resultado) {
    console.log("No toca todavía.");
    await prisma.$disconnect();
    return;
  }
  if (resultado.avisoOdoo) console.log(`⚠ ${resultado.avisoOdoo}`);
  console.log(`\n1 · ${APPLY ? "Cobradas" : "Se cobrarían"} solas: ${resultado.cobradas.length} cuotas · ${plata(resultado.cobradas)}`);
  for (const a of resultado.cobradas) {
    console.log(`   ${a.cuenta} · ${a.periodo} · ${a.moneda} ${a.monto} · ${a.numero} → cobrada el ${a.cobrar!.fechaCobro} (${a.fuente === "ODOO" ? "Odoo" : "Mercury"})`);
  }
  console.log(`\n2 · Pagadas que esperan a una persona: ${resultado.quedan.length} cuotas · ${plata(resultado.quedan)}`);
  for (const q of resultado.quedan) console.log(`   ${q.cuenta} · ${q.periodo} · ${q.moneda} ${q.monto} · ${q.numero} — ${q.motivo}`);
  console.log(`\n3 · Pagadas sin el día del pago (nunca se cobran solas): ${resultado.pagadasSinFecha}`);
  if (APPLY) {
    console.log(`\n✓ Saltadas: ${resultado.saltadas.length}.`);
    for (const s of resultado.saltadas) console.log(`   ${s.cuenta}: ${s.motivo}`);
  } else {
    console.log("\nSimulacro: no se escribió nada. El job `lo-pagado-daily` lo cobra solo cada mañana.");
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? `\n✗ ${e.message}` : e);
  process.exitCode = 1;
});
