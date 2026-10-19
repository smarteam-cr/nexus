/**
 * scripts/medir-numero-en-cuotas-cobradas.ts — cuántas cuotas YA COBRADAS reciben el número de su factura (2026-10-18).
 *
 * Mide el arreglo de la prueba 36 del roadmap («Que las facturas de Odoo se peguen solas»): hasta ese día `decidir`
 * (lib/cobranza/libro/hechos.ts) saltaba toda cuota COBRADA, así que una cuota cobrada sin número nunca recibía el de
 * su factura. Ahora la recibe si la factura está pagada allá; con la factura impaga es un choque y no se toca.
 *
 * ⛔ SOLO LECTURA: la base se abre en solo lectura y no se llama a Odoo ni a Mercury (las cuotas ya cobradas no
 * necesitan el día del pago). Wherex queda fuera. Escribir lo hace quien concilia, en Conciliación › «Lo pagado»
 * (sección «Se pegan a su factura»), o `scripts/aplicar-odoo-y-mercury.ts --apply`.
 *
 * Uso (PowerShell, en la carpeta del proyecto):
 *   npx tsx scripts/medir-numero-en-cuotas-cobradas.ts
 */
import "dotenv/config";
import "./lib/permitir-server-only";

process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=60000"].filter(Boolean).join(" ");

const plata = (xs: ReadonlyArray<{ monto: number; moneda: string }>) => {
  const t = new Map<string, number>();
  for (const x of xs) t.set(x.moneda, Math.round(((t.get(x.moneda) ?? 0) + x.monto) * 100) / 100);
  return [...t].map(([m, v]) => `${m} ${v.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`).join(" + ") || "—";
};
const esWherex = (nombre: string) => /wherex/i.test(nombre);

async function main() {
  const { prisma } = await import("@/lib/db/prisma");
  const { describirDestino } = await import("./lib/guard");
  const { cargarEntradaDelLibro } = await import("@/lib/cobranza/libro/aplicar");
  const { decidir, pegarMercury, pegarOdoo } = await import("@/lib/cobranza/libro/hechos");
  const { esDocumentoVivo } = await import("@/lib/cobranza/odoo/diferencias");
  const { normalizarNumeroFactura } = await import("@/lib/cobranza/numero-factura");
  const { crDateParts } = await import("@/lib/jobs/time");

  const hoy = crDateParts(new Date()).dateKey;
  console.log(`Base: ${describirDestino(process.env.DATABASE_URL)} · SOLO LECTURA · hoy ${hoy}`);

  const e = await cargarEntradaDelLibro(hoy);
  const sinWherex = { ...e, cobros: e.cobros.filter((c) => !esWherex(c.cuentaNombre)) };
  const pegados = [...pegarOdoo(sinWherex), ...pegarMercury(sinWherex)];
  const d = decidir(sinWherex, pegados, new Map());
  const de = (id: string) => sinWherex.datos.get(id)!;

  const nuevas = d.acciones.filter((a) => a.yaCobrada);
  console.log(`\n1 · Cuotas ya cobradas que reciben el número de su factura pagada: ${nuevas.length} · ${plata(nuevas.map((a) => de(a.cobroId)))}`);
  for (const fuente of ["ODOO", "MERCURY"] as const) {
    const xs = nuevas.filter((a) => a.fuente === fuente);
    console.log(`   ${fuente === "ODOO" ? "Odoo" : "Mercury"}: ${xs.length} · ${plata(xs.map((a) => de(a.cobroId)))}`);
    for (const a of xs) {
      const c = de(a.cobroId);
      const p = pegados.find((x) => x.cobroId === a.cobroId)!;
      const que = [a.numeroFactura ? "el número" : null, a.fechaEmision ? `la fecha ${a.fechaEmision}` : null].filter(Boolean).join(" y ");
      console.log(`     ${c.cuenta} · ${c.periodo} · ${c.moneda} ${c.monto} → ${a.numero} (por ${p.via === "numero" ? "número" : "monto"}): ${que}`);
    }
  }

  const choques = d.choques;
  console.log(`\n2 · Choques (cobrada acá, impaga allá): ${choques.length} · ${plata(choques.map((p) => de(p.cobroId)))} — no reciben el número`);
  for (const p of choques) {
    const c = de(p.cobroId);
    console.log(`     ${c.cuenta} · ${c.periodo} · ${c.moneda} ${c.monto} ↔ ${p.numero} (por ${p.via === "numero" ? "número" : "monto"})`);
  }

  /* Las facturas de Odoo emitidas este año que no quedan en ninguna cuota: antes y después de aplicar lo pegado. */
  const anio = hoy.slice(0, 4);
  const emitidas = sinWherex.facturasOdoo.filter((f) => esDocumentoVivo(f) && f.invoiceDate.startsWith(anio) && !esWherex(f.odooPartnerNombre));
  const conNumero = new Set(sinWherex.cobros.map((c) => normalizarNumeroFactura(c.numeroFactura)).filter((n): n is string => !!n));
  const conPegar = (acciones: typeof d.acciones) =>
    new Set([...conNumero, ...acciones.filter((a) => a.fuente === "ODOO" && a.numeroFactura).map((a) => normalizarNumeroFactura(a.numeroFactura)!)]);
  const sinCuota = (numeros: Set<string>) => emitidas.filter((f) => !numeros.has(normalizarNumeroFactura(f.numero)!));
  const antes = sinCuota(conPegar(d.acciones.filter((a) => !a.yaCobrada)));
  const despues = sinCuota(conPegar(d.acciones));
  console.log(`\n3 · Facturas de Odoo emitidas en ${anio} (sin Wherex): ${emitidas.length}`);
  console.log(`   Sin cuota, aplicando todo lo que se pega: antes del arreglo ${antes.length} · después ${despues.length}`);
  const salen = antes.filter((f) => !despues.includes(f));
  for (const f of salen) console.log(`     se pega ahora: ${f.numero} · ${f.odooPartnerNombre}`);

  console.log("\nSolo lectura: no se escribió nada.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
