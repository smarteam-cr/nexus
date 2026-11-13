/**
 * lib/ventas/metas.ts — las metas comerciales y lo vendido de cada persona. SERVIDOR.
 *
 * El ÚNICO lugar donde Nexus lee las metas: Comisiones, «Para ti», la ficha de una persona o un
 * reporte importan de acá, no consultan `MetaComercial` por su cuenta.
 *
 * Solo la meta de VENTAS (`sales_quota`): las de llamadas, leads o del programa de partners no son dinero.
 *
 * Dos números por persona, y no se mezclan:
 *  · `avance` — lo que HubSpot dice que lleva contra su meta. Es el oficial: el mismo que ve el
 *    equipo en HubSpot.
 *  · `vendidoNexus` — la suma de sus negocios ganados en Nexus (`VentaGanada.vendedorId`), en la
 *    misma moneda de la meta. Sirve de control: si se separan mucho, algo no está cargado igual.
 */
import { prisma } from "@/lib/db/prisma";
import { TIPOS_DEL_PLAN_DE_PARTNER, type TipoDelPlanDePartner, type TramoDelPlanDePartner } from "@/lib/finanzas/metas-de-gerencia";
import { metasDelAnio, type MetaDelAnio } from "./metas-reglas";
import { VENTA_QUE_CUENTA } from "./regla-de-lo-vendido";

export interface MetaDePersona extends MetaDelAnio {
  nombrePersona: string;
  email: string;
  /** Lo vendido en el año según los negocios ganados de Nexus, en la moneda de la meta. */
  vendidoNexus: number;
  /** Negocios ganados del año en OTRA moneda: no se suman ni se convierten, se cuentan. */
  ventasEnOtraMoneda: number;
  /** Cuándo se copió la meta de HubSpot por última vez. */
  sincronizadoEn: Date | null;
}

export async function metasPorPersona(anio: number): Promise<MetaDePersona[]> {
  const desde = new Date(Date.UTC(anio, 0, 1));
  const hasta = new Date(Date.UTC(anio + 1, 0, 1));
  const [tramos, ventas] = await Promise.all([
    prisma.metaComercial.findMany({
      // Un día de margen hacia atrás: el 1 de enero en Costa Rica es el 31 de diciembre a las 18:00 en UTC.
      where: { vigente: true, teamMemberId: { not: null }, desde: { gte: new Date(+desde - 86_400_000), lt: hasta } },
      select: { teamMemberId: true, hubspotGoalId: true, nombre: true, tipo: true, desde: true, hasta: true, monto: true, avance: true, moneda: true, sincronizadoEn: true },
    }),
    prisma.ventaGanada.findMany({
      // La regla única de lo vendido (lib/ventas/regla-de-lo-vendido.ts): de cualquier pipeline.
      where: { ...VENTA_QUE_CUENTA, vendedorId: { not: null }, fechaCierre: { gte: desde, lt: hasta } },
      select: { vendedorId: true, monto: true, moneda: true },
    }),
  ]);
  // El tramo que empieza a medianoche de Costa Rica cae el 31 de diciembre en UTC: se corre seis horas.
  const metas = metasDelAnio(
    tramos.map((t) => ({
      teamMemberId: t.teamMemberId,
      tipo: t.tipo,
      hubspotGoalId: t.hubspotGoalId,
      nombre: t.nombre,
      desde: new Date(+t.desde + 6 * 3_600_000),
      hasta: new Date(+t.hasta + 6 * 3_600_000 + 1),
      monto: Number(t.monto),
      avance: t.avance === null ? null : Number(t.avance),
      moneda: t.moneda,
    })),
    anio,
  );
  if (metas.length === 0) return [];
  const personas = await prisma.teamMember.findMany({
    where: { id: { in: metas.map((m) => m.teamMemberId) } },
    select: { id: true, name: true, email: true },
  });
  const persona = new Map(personas.map((p) => [p.id, p]));
  const ultima = new Map<string, Date>();
  for (const t of tramos) {
    if (!t.teamMemberId) continue;
    const prev = ultima.get(t.teamMemberId);
    if (!prev || t.sincronizadoEn > prev) ultima.set(t.teamMemberId, t.sincronizadoEn);
  }
  return metas
    .map((m) => {
      const propias = ventas.filter((v) => v.vendedorId === m.teamMemberId);
      return {
        ...m,
        nombrePersona: persona.get(m.teamMemberId)?.name ?? "—",
        email: persona.get(m.teamMemberId)?.email ?? "",
        vendidoNexus: Math.round(propias.filter((v) => v.moneda === m.moneda).reduce((a, v) => a + Number(v.monto ?? 0), 0) * 100) / 100,
        ventasEnOtraMoneda: propias.filter((v) => v.moneda !== m.moneda).length,
        sincronizadoEn: ultima.get(m.teamMemberId) ?? null,
      };
    })
    .sort((a, b) => b.monto - a.monto);
}

/**
 * Los tramos mensuales de las metas «Partner Mutual Action Plan» de HubSpot que son MRR de negocios (traídos por
 * Smarteam y asistidos), de los meses que tocan el período. Son metas de la EMPRESA, sin persona: no son cuota de
 * ventas y `metasPorPersona` no las lee. Las usa Finanzas › Metas y bonos (lib/finanzas/metas-de-gerencia-server.ts).
 * El avance es el de HubSpot (`hs_kpi_value`), igual que en las metas de ventas: Nexus no lo recalcula.
 */
export async function tramosDelPlanDePartner(desdeISO: string, hastaISO: string): Promise<{ tramos: TramoDelPlanDePartner[]; sincronizadoEn: Date | null }> {
  // Un día de margen hacia cada lado: el mes del tramo lo decide `mes`, y lo filtra `leerPlanDePartner`.
  const desde = new Date(Date.parse(`${desdeISO.slice(0, 7)}-01T00:00:00Z`) - 86_400_000);
  const hasta = new Date(Date.parse(`${hastaISO}T00:00:00Z`) + 2 * 86_400_000);
  const filas = await prisma.metaComercial.findMany({
    where: { vigente: true, tipo: { in: Object.keys(TIPOS_DEL_PLAN_DE_PARTNER) }, desde: { gte: desde, lt: hasta } },
    select: { tipo: true, desde: true, monto: true, avance: true, sincronizadoEn: true },
  });
  let sincronizadoEn: Date | null = null;
  const tramos: TramoDelPlanDePartner[] = [];
  for (const f of filas) {
    if (!sincronizadoEn || f.sincronizadoEn > sincronizadoEn) sincronizadoEn = f.sincronizadoEn;
    tramos.push({
      tipo: f.tipo as TipoDelPlanDePartner,
      // Igual que `metasPorPersona`: se corre seis horas hacia adelante, para que un tramo guardado como la medianoche de
      // Costa Rica en UTC (las 18:00 del día anterior) caiga en su mes. Medido el 2026-11-13: llegan a las 00:00 UTC
      // del día 1, y correrlas seis horas no las cambia de mes.
      mes: new Date(+f.desde + 6 * 3_600_000).toISOString().slice(0, 7),
      monto: Number(f.monto),
      avance: f.avance === null ? null : Number(f.avance),
    });
  }
  return { tramos, sincronizadoEn };
}
