/**
 * scripts/inspect-datos-equilibrio.ts  (SOLO LECTURA — paso 0b del reporte de equilibrio)
 *
 * Las cuatro mediciones que hay que tener ANTES de construir el reporte anual de
 * equilibrio. No escribe nada: ni una fila, ni en Nexus ni en HubSpot.
 *
 *   1. ¿Cuántos `Cobro` en estado COBRADO tienen `fechaCobro` en null?
 *      Es la que puede tumbar un supuesto del diseño. El reporte dibuja una curva de
 *      "cobrado por mes" imputando cada cobro a su `fechaCobro` —el reloj del dinero—
 *      con fallback al `periodo` cuando falta. Si la fecha falta en la mitad, esa curva
 *      es en realidad "cobrado por periodo de facturación" con otro nombre, y la
 *      pantalla tiene que DECIRLO en vez de dejar que se lea como caja real.
 *
 *   2. ¿Qué meses de `PagoPlanilla` tienen sus DOS quincenas registradas?
 *      La planilla es ~78% del costo y es la única serie mensual real que el sistema ya
 *      tenía. Un mes con una sola quincena es PARCIAL: contarlo entero en el promedio
 *      del punto de equilibrio bajaría el piso a la mitad de un mes cualquiera.
 *
 *   3. ¿Cuánta plata hay en colones, de verdad?
 *      Decide cuánto pesa el tipo de cambio. Si CRC es marginal, la conversión casi no
 *      interviene y el reporte se sostiene con muy pocas tasas cargadas.
 *
 *   4. Los totales del año contra el reporte que se está replicando.
 *      El prototipo de `dev.smarteamcr.com/finanzas/` dice: facturado $227.098, cobrado
 *      $141.929, pendiente de facturar $77.750, total $304.848. Si Nexus da otra cosa,
 *      hay que entender la diferencia ANTES de construir encima — no después.
 *
 * Uso: npx tsx scripts/inspect-datos-equilibrio.ts [--anio=2026]
 */
import "dotenv/config";
import { createScriptDb } from "./lib/db";

const { prisma, close } = createScriptDb();

const anioArg = process.argv.find((a) => a.startsWith("--anio="));
const ANIO = anioArg ? Number(anioArg.split("=")[1]) : 2026;

const money = (n: number) => n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (parte: number, total: number) => (total === 0 ? "—" : `${Math.round((parte / total) * 1000) / 10}%`);
const linea = (t: string) => console.log(`\n${"─".repeat(78)}\n${t}\n${"─".repeat(78)}`);

/** Los 12 períodos "YYYY-MM" del año. */
const periodosDelAnio = (anio: number) =>
  Array.from({ length: 12 }, (_, i) => `${anio}-${String(i + 1).padStart(2, "0")}`);

async function main() {
  console.log(`\n╔══ DATOS PARA EL REPORTE DE EQUILIBRIO · ${ANIO} ══╗`);
  const PERIODOS = periodosDelAnio(ANIO);

  // ── 1. Cobros COBRADO sin fechaCobro ────────────────────────────────────────
  linea("1 · ¿La curva de «cobrado» puede llamarse cobrado?");

  const cobrados = await prisma.cobro.findMany({
    where: { estado: "COBRADO" },
    select: { monto: true, moneda: true, periodo: true, fechaCobro: true },
  });
  const sinFecha = cobrados.filter((c) => c.fechaCobro === null);
  const montoSinFecha = sinFecha.reduce((n, c) => n + Number(c.monto), 0);
  const montoTotal = cobrados.reduce((n, c) => n + Number(c.monto), 0);

  console.log(`Cobros en estado COBRADO: ${cobrados.length}`);
  console.log(`  · con fechaCobro:  ${cobrados.length - sinFecha.length}`);
  console.log(`  · SIN fechaCobro:  ${sinFecha.length}  (${pct(sinFecha.length, cobrados.length)} de las filas)`);
  console.log(`Plata sin fecha de cobro: ${money(montoSinFecha)} de ${money(montoTotal)} (${pct(montoSinFecha, montoTotal)})`);

  // El veredicto se imprime solo: es la decisión que dispara este número.
  const ratio = cobrados.length === 0 ? 0 : sinFecha.length / cobrados.length;
  if (ratio === 0) {
    console.log("\n✓ VEREDICTO: todos tienen fecha. La curva de cobrado es caja real.");
  } else if (ratio < 0.15) {
    console.log(`\n✓ VEREDICTO: falta en pocos (${pct(sinFecha.length, cobrados.length)}). Imputar por periodo`);
    console.log("  esos casos y declararlo en el pie del reporte alcanza.");
  } else {
    console.log(`\n⚠ VEREDICTO: falta en ${pct(sinFecha.length, cobrados.length)} de los cobros. La curva NO se puede`);
    console.log("  rotular «cobrado por mes» sin aclarar que buena parte se imputa por periodo");
    console.log("  de facturación. Decidir el rótulo ANTES de construir la pantalla.");
  }

  if (sinFecha.length > 0) {
    const porPeriodo = new Map<string, number>();
    for (const c of sinFecha) porPeriodo.set(c.periodo, (porPeriodo.get(c.periodo) ?? 0) + 1);
    console.log("\n  Sin fecha, por periodo:");
    for (const p of [...porPeriodo.keys()].sort()) console.log(`    ${p}: ${porPeriodo.get(p)}`);
  }

  // ── 2. Cobertura del libro de planilla ──────────────────────────────────────
  linea("2 · ¿Qué meses de planilla están completos? (define el mes COMPLETO)");

  const pagos = await prisma.pagoPlanilla.findMany({
    where: { periodo: { in: PERIODOS } },
    select: { periodo: true, quincena: true, monto: true, moneda: true, estado: true, sujetoNombre: true },
  });

  if (pagos.length === 0) {
    console.log("⚠ No hay NI UNA fila de PagoPlanilla en el año. Sin esto no hay serie de egresos:");
    console.log("  correr scripts/import-planilla-xlsx.ts antes de seguir.");
  } else {
    const porPeriodo = new Map<string, { q: Set<number>; personas: Set<string>; total: Map<string, number> }>();
    for (const p of pagos) {
      let g = porPeriodo.get(p.periodo);
      if (!g) porPeriodo.set(p.periodo, (g = { q: new Set(), personas: new Set(), total: new Map() }));
      g.q.add(p.quincena);
      g.personas.add(p.sujetoNombre);
      g.total.set(p.moneda, (g.total.get(p.moneda) ?? 0) + Number(p.monto));
    }
    console.log("PERIODO   QUINCENAS  PERSONAS  TOTAL DEL MES");
    let completos = 0;
    for (const p of PERIODOS) {
      const g = porPeriodo.get(p);
      if (!g) {
        console.log(`${p}       0/2      —         (sin datos)`);
        continue;
      }
      const ok = g.q.size === 2;
      if (ok) completos++;
      const totales = [...g.total.entries()].map(([m, v]) => `${m} ${money(v)}`).join(" · ");
      console.log(`${p}       ${g.q.size}/2 ${ok ? "✓" : "⚠"}    ${String(g.personas.size).padStart(2)}        ${totales}`);
    }
    console.log(`\nMeses con planilla completa: ${completos} de 12.`);
    console.log("Esos son los únicos que pueden entrar al promedio del equilibrio como MEDIDOS.");
  }

  // ── 3. Cuánta plata está en colones ─────────────────────────────────────────
  linea("3 · ¿Cuánto pesa el tipo de cambio?");

  const [cobrosPorMoneda, costosPorMoneda, comisionesPorMoneda] = await Promise.all([
    prisma.cobro.groupBy({ by: ["moneda"], _count: true, _sum: { monto: true } }),
    prisma.costoRecurrente.groupBy({ by: ["moneda"], where: { activo: true }, _count: true, _sum: { monto: true } }),
    prisma.comisionPartner.groupBy({ by: ["moneda"], _count: true, _sum: { monto: true } }),
  ]);
  const planillaPorMoneda = new Map<string, { n: number; total: number }>();
  for (const p of pagos) {
    const g = planillaPorMoneda.get(p.moneda) ?? { n: 0, total: 0 };
    g.n++;
    g.total += Number(p.monto);
    planillaPorMoneda.set(p.moneda, g);
  }

  const fila = (que: string, rows: Array<{ moneda: string; n: number; total: number }>) => {
    if (rows.length === 0) return console.log(`${que.padEnd(22)} (sin filas)`);
    for (const r of rows) console.log(`${que.padEnd(22)} ${r.moneda}  ${String(r.n).padStart(4)} filas  ${money(r.total)}`);
  };
  fila("Cobros", cobrosPorMoneda.map((r) => ({ moneda: r.moneda, n: r._count, total: Number(r._sum.monto ?? 0) })));
  fila("Costos recurrentes", costosPorMoneda.map((r) => ({ moneda: r.moneda, n: r._count, total: Number(r._sum.monto ?? 0) })));
  fila("Planilla", [...planillaPorMoneda.entries()].map(([moneda, g]) => ({ moneda, n: g.n, total: g.total })));
  fila("Comisiones partner", comisionesPorMoneda.map((r) => ({ moneda: r.moneda, n: r._count, total: Number(r._sum.monto ?? 0) })));

  const hayCRC =
    cobrosPorMoneda.some((r) => r.moneda === "CRC") ||
    costosPorMoneda.some((r) => r.moneda === "CRC") ||
    planillaPorMoneda.has("CRC") ||
    comisionesPorMoneda.some((r) => r.moneda === "CRC");
  console.log(
    hayCRC
      ? "\n⚠ Hay montos en COLONES: el reporte necesita las 12 tasas cargadas o esos meses\n  van a aparecer con plata sin convertir (declarada, nunca escondida)."
      : "\n✓ Todo está en dólares: el tipo de cambio queda como red de seguridad, no como\n  requisito para ver el reporte.",
  );

  // ── 4. Los totales del año, contra el prototipo ─────────────────────────────
  linea(`4 · Los totales de ${ANIO} contra el reporte que se está replicando`);

  const delAnio = await prisma.cobro.findMany({
    where: { periodo: { in: PERIODOS } },
    select: { monto: true, moneda: true, estado: true },
  });
  const acc = new Map<string, Map<string, { n: number; total: number }>>();
  for (const c of delAnio) {
    let porMoneda = acc.get(c.estado);
    if (!porMoneda) acc.set(c.estado, (porMoneda = new Map()));
    const g = porMoneda.get(c.moneda) ?? { n: 0, total: 0 };
    g.n++;
    g.total += Number(c.monto);
    porMoneda.set(c.moneda, g);
  }
  for (const estado of ["COBRADO", "POR_COBRAR", "PROGRAMADO", "SIN_DATO"]) {
    const porMoneda = acc.get(estado);
    if (!porMoneda) {
      console.log(`${estado.padEnd(12)} (ninguno)`);
      continue;
    }
    for (const [moneda, g] of porMoneda) {
      console.log(`${estado.padEnd(12)} ${moneda}  ${String(g.n).padStart(4)} cobros  ${money(g.total)}`);
    }
  }

  const usdDe = (estado: string) => acc.get(estado)?.get("USD")?.total ?? 0;
  const facturado = usdDe("COBRADO") + usdDe("POR_COBRAR");
  console.log(`\nEn la definición del reporte (facturado = cobrado + por cobrar), USD:`);
  console.log(`  facturado ${money(facturado)}   ·   prototipo: 227.097,66`);
  console.log(`  cobrado   ${money(usdDe("COBRADO"))}   ·   prototipo: 141.928,99`);
  console.log(`  pendiente ${money(usdDe("PROGRAMADO"))}   ·   prototipo:  77.750,32`);
  console.log("\nDiferencias esperables: el prototipo se armó con un corte anterior del Excel.");
  console.log("Lo que NO es esperable es una diferencia de orden de magnitud — eso sería otro criterio.");

  // ── Extra: qué hay ya cargado de lo que el reporte necesita ─────────────────
  linea("Extra · Inventario de lo que el reporte va a leer");
  const [costos, tarjetas, comisiones, gastos, aguinaldos] = await Promise.all([
    prisma.costoRecurrente.count(),
    prisma.tarjetaCredito.count(),
    prisma.comisionPartner.count(),
    prisma.gastoPuntual.count(),
    prisma.aguinaldoPago.count(),
  ]);
  console.log(`CostoRecurrente: ${costos} · TarjetaCredito: ${tarjetas} · ComisionPartner: ${comisiones}`);
  console.log(`GastoPuntual: ${gastos} · AguinaldoPago: ${aguinaldos} (se espera 0: el modelo está sin uso)`);
  console.log("\n(EgresoMensual y TipoCambioMes todavía no existen: los crea la migración de la tanda 1.)\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(close);
