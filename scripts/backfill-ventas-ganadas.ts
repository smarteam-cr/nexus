/**
 * scripts/backfill-ventas-ganadas.ts
 *
 * Llena el espejo de ventas ganadas desde HubSpot. Dry-run por default; escribe solo con
 * `--apply` + ALLOW_PROD_WRITE=1.
 *
 * Es la carga inicial de `VentaGanada`: de acá en adelante el job diario la mantiene al
 * día. Sirve también para re-sincronizar un rango a mano cuando haga falta.
 *
 * Uso:
 *   npx tsx scripts/backfill-ventas-ganadas.ts --desde=2026-01-01 --hasta=2026-12-31
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/backfill-ventas-ganadas.ts --desde=2026-01-01 --hasta=2026-12-31 --apply
 */
import "dotenv/config";
import { resolverApply } from "./lib/guard";
import { syncVentasGanadas, PIPELINES_VENTA_PROPIA } from "../lib/ventas/sync-ganadas";
import { clasificarVentas } from "../lib/ventas/clasificar-huecos";
import { prisma } from "../lib/db/prisma";

const opt = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1] ?? null;
const DESDE = opt("desde") ?? `${new Date().getUTCFullYear()}-01-01`;
const HASTA = opt("hasta") ?? `${new Date().getUTCFullYear()}-12-31`;
const m = (n: number) => "$" + n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
  const apply = resolverApply();
  console.log(`\nEspejo de ventas ganadas · ${DESDE} → ${HASTA}${apply ? "" : "  (dry-run)"}\n`);

  const r = await syncVentasGanadas({ desde: DESDE, hasta: HASTA, dryRun: !apply });
  if (r.locked) {
    console.log("Otra corrida tiene el lock (la otra PC, el cron, o un script). No se hizo nada.");
    return;
  }
  console.log(`  traídas de HubSpot: ${r.traidas}`);
  console.log(`  altas: ${r.altas} · actualizadas: ${r.actualizadas} · sin cambio: ${r.sinCambio}`);
  if (r.sinMonto > 0) console.log(`  ⚠ ${r.sinMonto} venta(s) SIN monto en HubSpot: se espejan igual, con el monto en blanco.`);
  console.log(`  cambios anotados en la bitácora: ${r.cambios} · reclasificadas: ${r.reclasificadas}`);
  if (r.parcial) console.log(`  ⚠ CORRIDA PARCIAL — no se reclasificó nada.`);
  for (const e of r.errores) console.log(`  ⚠ ${e}`);

  if (!apply) {
    console.log(`\n(dry-run — no se escribió nada. Agregá --apply para llenar el espejo.)`);
    return;
  }

  // ── Lo que quedó en la base, ya clasificado ────────────────────────────────
  const anio = Number(DESDE.slice(0, 4));
  const ventas = await prisma.ventaGanada.findMany({
    where: { fechaCierre: { gte: new Date(`${DESDE}T00:00:00.000Z`), lte: new Date(`${HASTA}T00:00:00.000Z`) }, estado: "GANADA" },
    select: {
      hubspotDealId: true, nombre: true, fechaCierre: true, monto: true, moneda: true,
      montoConvertidoHubspot: true, pipelineId: true, clientId: true, clienteVia: true,
      excluida: true, sospechaPrueba: true,
      client: { select: { name: true } },
    },
  });
  // Para el resumen se usa el convertido de HubSpot: el reporte hará su propia conversión
  // con TipoCambioMes, y las dos cifras se comparan en pantalla.
  const paraClasificar = ventas.map((v) => ({
    hubspotDealId: v.hubspotDealId,
    nombre: v.nombre,
    fechaCierre: v.fechaCierre.toISOString().slice(0, 10),
    monto: v.montoConvertidoHubspot !== null ? Number(v.montoConvertidoHubspot) : Number(v.monto),
    pipelineId: v.pipelineId,
    clientId: v.clientId,
    excluida: v.excluida,
    sospechaPrueba: v.sospechaPrueba,
  }));

  const cobros = await prisma.cobro.groupBy({
    by: ["cuentaId"],
    where: { periodo: { startsWith: String(anio) }, estado: { in: ["COBRADO", "POR_COBRAR"] } },
    _sum: { monto: true },
  });
  const cuentas = await prisma.cuentaFinanciera.findMany({ select: { id: true, clientId: true } });
  const clientDeCuenta = new Map(cuentas.map((c) => [c.id, c.clientId]));
  const porCliente = new Map<string, number>();
  for (const c of cobros) {
    const cli = clientDeCuenta.get(c.cuentaId);
    if (!cli) continue;
    porCliente.set(cli, (porCliente.get(cli) ?? 0) + Number(c._sum.monto ?? 0));
  }

  const resumen = clasificarVentas(
    paraClasificar,
    [...porCliente.entries()].map(([clientId, facturado]) => ({ clientId, facturado })),
    { anio, pipelinesQueCuentan: [...PIPELINES_VENTA_PROPIA] },
  );

  console.log(`\n╔══ VENDIDO ${anio} ══╗`);
  console.log(`  ${m(resumen.vendido)} en ${resumen.cuantas} ventas`);
  if (resumen.fueraDePipeline.cuantas > 0) {
    console.log(`  + ${m(resumen.fueraDePipeline.monto)} en ${resumen.fueraDePipeline.cuantas} tratos de otros pipelines`);
    console.log(`    (Shared Selling: registro de oportunidad con HubSpot, decisión pendiente)`);
  }
  if (resumen.excluidas.cuantas > 0) console.log(`  − ${m(resumen.excluidas.monto)} excluidos (${resumen.excluidas.cuantas})`);
  const sospechosos = ventas.filter((v) => v.sospechaPrueba && !v.excluida);
  if (sospechosos.length) {
    console.log(`\n  ⚠ ${sospechosos.length} trato(s) con nombre de prueba, SIN excluir todavía:`);
    for (const s of sospechosos) console.log(`      ${s.nombre}`);
  }

  console.log(`\n  POR MES:`);
  for (const x of resumen.porMes) console.log(`    ${x.periodo}  ${m(x.vendido).padStart(14)}  (${x.cuantas})`);

  console.log(`\n╔══ HUECO CONTRA COBRANZA ══╗  ${m(resumen.hueco)}`);
  for (const [clase, g] of Object.entries(resumen.porClase)) {
    if (g.cuantas === 0) continue;
    console.log(`  ${clase.padEnd(14)} ${String(g.cuantas).padStart(3)} ventas · ${m(g.monto).padStart(14)} · descubierto ${m(g.descubierto)}`);
  }
  const porVia = new Map<string, number>();
  for (const v of ventas) porVia.set(v.clienteVia ?? "(sin cliente)", (porVia.get(v.clienteVia ?? "(sin cliente)") ?? 0) + 1);
  console.log(`\n  Cómo se resolvió el cliente: ${[...porVia.entries()].map(([k, n]) => `${k}=${n}`).join(" · ")}`);
  console.log(`  ⚠ "nombre" significa que la venta cuelga de OTRA empresa que la que factura`);
  console.log(`     (empresa duplicada en HubSpot, o la madre de un grupo).`);
}

main()
  .catch((e) => {
    console.error("ERROR:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
