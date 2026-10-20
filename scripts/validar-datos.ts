/**
 * scripts/validar-datos.ts — SOLO LECTURA. ¿Llega bien el dato? (pasada de validación del 2026-10-19,
 * docs/validacion-2026-10-19.md › área 6).
 *
 * Imprime, para cada job del servidor, su último resultado (lo mismo que pinta Integraciones › Jobs del servidor) y,
 * para cada copia, cuándo se escribió por última vez y cuántas filas vivas tiene: negocios abiertos, metas, contactos,
 * tickets, comunicaciones, tareas de HubSpot, ventas ganadas, facturas de Odoo, Mercury, tipo de cambio, la lectura de
 * cada reunión (los estados de los últimos 7 días), los hechos, el índice de las reuniones y el latido de uso.
 *
 * No dice si un job está APAGADO en el servidor: eso depende del `.env` del VPS, que esta PC no tiene. Un job que no
 * corrió hoy y que tiene requisito se marca «¿apagado?».
 *
 *   npx tsx scripts/validar-datos.ts
 */
import "dotenv/config";
import "./lib/permitir-server-only";

process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=60000"].filter(Boolean).join(" ");
process.env.DB_POOL_MAX ??= "2";

const hace = (d: Date | null | undefined) => {
  if (!d) return "nunca";
  const min = Math.round((Date.now() - d.getTime()) / 60_000);
  if (min < 90) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
};

async function main() {
  const { prisma } = await import("@/lib/db/prisma");
  const { allJobs } = await import("@/lib/jobs/defs");
  const { leerEstadoDeJobs } = await import("@/lib/jobs/estado");
  const { nombreDeJob } = await import("@/lib/jobs/nombres");
  const { JOBS_CON_REQUISITO } = await import("@/lib/jobs/requisitos");

  console.log("══ Jobs del servidor (último resultado)");
  const claves = allJobs().map((j) => j.key);
  const estados = await leerEstadoDeJobs(claves);
  let rojos = 0;
  for (const e of estados) {
    const r = e.resultado;
    const cuando = r ? new Date(r.at) : null;
    const req = JOBS_CON_REQUISITO.includes(e.key) ? " (tiene requisito)" : "";
    if (r && !r.ok) rojos++;
    const viejo = !r && !e.lastRunAt ? (req ? " · ¿apagado?" : " · nunca anotó") : "";
    console.log(`   ${r ? (r.ok ? "✓" : "✗") : "·"} ${nombreDeJob(e.key)} [${e.key}] · ${r ? hace(cuando) : `claim ${hace(e.lastRunAt)}`}${r && !r.ok ? ` · ${r.error.slice(0, 140)}` : ""}${viejo}${req}`);
  }
  console.log(`   → ${rojos} en rojo`);

  console.log("\n══ Copias");
  const [neg, negMax] = await Promise.all([
    prisma.negocioAbierto.count({ where: { abierto: true } }),
    prisma.negocioAbierto.aggregate({ _max: { sincronizadoEn: true } }),
  ]);
  console.log(`   Negocios abiertos: ${neg} vivos · última copia ${hace(negMax._max.sincronizadoEn)}`);
  const metas = await prisma.metaComercial.findMany({ where: { vigente: true }, select: { tipo: true, sincronizadoEn: true } });
  const metasVentas = metas.filter((m) => m.tipo === "sales_quota").length;
  const metaMax = metas.reduce<Date | null>((a, m) => (!a || m.sincronizadoEn > a ? m.sincronizadoEn : a), null);
  console.log(`   Metas comerciales: ${metas.length} tramos vigentes (${metasVentas} de ventas) · última copia ${hace(metaMax)}`);
  const [ct, ctMax, tk, tkAb, tkMax] = await Promise.all([
    prisma.contactoDeHubspot.count({ where: { vigente: true } }),
    prisma.contactoDeHubspot.aggregate({ _max: { copiadoAt: true } }),
    prisma.ticketDeHubspot.count({ where: { vigente: true } }),
    prisma.ticketDeHubspot.count({ where: { vigente: true, abierto: true } }),
    prisma.ticketDeHubspot.aggregate({ _max: { copiadoAt: true } }),
  ]);
  console.log(`   Contactos: ${ct} vigentes · última copia ${hace(ctMax._max.copiadoAt)}`);
  console.log(`   Tickets: ${tk} vigentes (${tkAb} abiertos) · última copia ${hace(tkMax._max.copiadoAt)}`);
  const { estadoDeLasComunicaciones } = await import("@/lib/comunicaciones/estado-server");
  const com = await estadoDeLasComunicaciones();
  for (const c of com.porTipo) console.log(`   Comunicaciones · ${c.tipo}: ${c.vigentes} · última copia ${hace(c.ultimaCopia)} · la más nueva ocurrió ${hace(c.laMasNueva)}`);
  if (com.porTipo.length === 0) console.log("   Comunicaciones: ninguna");
  console.log(`   Compromisos de correos: ${com.compromisos.map((c) => `${c.estado} ${c.cuantos}`).join(" · ")}`);
  const [tHs, tHsMax, tHsErr] = await Promise.all([
    prisma.tarea.count({ where: { origen: "hubspot", archivadaAt: null } }),
    prisma.tarea.aggregate({ where: { origen: "hubspot" }, _max: { hubspotSincronizadaAt: true } }),
    prisma.tarea.count({ where: { origen: "hubspot", hubspotError: { not: null } } }),
  ]);
  console.log(`   Tareas de HubSpot: ${tHs} · última sincronización ${hace(tHsMax._max.hubspotSincronizadaAt)} · con error ${tHsErr}`);
  const [vg, vgMax] = await Promise.all([prisma.ventaGanada.count(), prisma.ventaGanada.aggregate({ _max: { sincronizadoEn: true } })]);
  console.log(`   Ventas ganadas: ${vg} · última copia ${hace(vgMax._max.sincronizadoEn)}`);
  const [fo, odoo] = await Promise.all([
    prisma.facturaOdoo.count(),
    prisma.syncOdooCorrida.findFirst({ orderBy: { iniciadaEn: "desc" }, select: { iniciadaEn: true, ok: true, parcial: true, facturasVistas: true } }),
  ]);
  console.log(`   Odoo: ${fo} facturas · última corrida ${hace(odoo?.iniciadaEn)} (${odoo?.ok ? "ok" : "falló"}${odoo?.parcial ? ", parcial" : ""}, ${odoo?.facturasVistas ?? 0} vistas)`);
  const merc = await prisma.syncMercuryCorrida.findFirst({ orderBy: { iniciadaEn: "desc" }, select: { iniciadaEn: true, ok: true } });
  const mercOk = await prisma.syncMercuryCorrida.findFirst({ where: { ok: true }, orderBy: { iniciadaEn: "desc" }, select: { iniciadaEn: true } });
  console.log(`   Mercury: última corrida ${hace(merc?.iniciadaEn)} (${merc?.ok ? "ok" : "falló"}) · última buena ${hace(mercOk?.iniciadaEn)}`);
  const tc = await prisma.tipoCambioDia.findFirst({ orderBy: { fecha: "desc" }, select: { fecha: true, venta: true, fuente: true } });
  console.log(`   Tipo de cambio: último día ${tc?.fecha} (₡${tc?.venta?.toString()}, ${tc?.fuente})`);

  console.log("\n══ La lectura de cada reunión (reuniones de los últimos 7 días)");
  const desde7 = new Date(Date.now() - 7 * 86_400_000);
  const lec = await prisma.lecturaDeReunion.groupBy({ by: ["seguimientoEstado"], where: { session: { date: { gte: desde7 } } }, _count: true });
  console.log(`   Seguimiento: ${lec.map((l) => `${l.seguimientoEstado ?? "— (solo Tareas)"} ${l._count}`).join(" · ")}`);
  const lecT = await prisma.lecturaDeReunion.groupBy({ by: ["estado"], where: { session: { date: { gte: desde7 } } }, _count: true });
  console.log(`   Tareas: ${lecT.map((l) => `${l.estado} ${l._count}`).join(" · ")}`);
  const errores = await prisma.lecturaDeReunion.findMany({ where: { seguimientoEstado: "error" }, select: { sessionId: true, seguimientoError: true } });
  for (const e of errores) console.log(`   ✗ en error: ${e.sessionId} · ${(e.seguimientoError ?? "").slice(0, 120)}`);
  const hechos = await prisma.hechoDeReunion.groupBy({ by: ["estado"], _count: true, _max: { createdAt: true } });
  console.log(`   Hechos: ${hechos.map((h) => `${h.estado} ${h._count}`).join(" · ")} · el más nuevo ${hace(hechos.reduce<Date | null>((a, h) => (h._max.createdAt && (!a || h._max.createdAt > a) ? h._max.createdAt : a), null))}`);
  const turnos = await prisma.turnoDeReunion.count();
  console.log(`   Índice de las reuniones: ${turnos} turnos`);

  console.log("\n══ Reuniones sin texto (14 días, con cliente, ya terminadas)");
  const desde14 = new Date(Date.now() - 14 * 86_400_000);
  const reun = await prisma.firefliesSession.findMany({
    where: { date: { gte: desde14, lte: new Date(Date.now() - 6 * 3_600_000) }, resolvedClientId: { not: null } },
    select: { transcript: true, summary: true },
  });
  const sinNada = reun.filter((r) => !r.transcript && !(r.summary && typeof r.summary === "object" && (r.summary as Record<string, unknown>).overview));
  console.log(`   ${reun.length} reuniones con dueño; ${sinNada.length} sin transcripción ni notas (${Math.round((100 * sinNada.length) / Math.max(1, reun.length))} %)`);

  console.log("\n══ Uso");
  const uso = await prisma.usoDeNexus.aggregate({ _max: { ultimaAt: true } });
  console.log(`   Último latido: ${hace(uso._max.ultimaAt)}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
