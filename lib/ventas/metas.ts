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
import { metasDelAnio, type MetaDelAnio } from "./metas-reglas";

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
      where: { estado: "GANADA", excluida: false, vendedorId: { not: null }, fechaCierre: { gte: desde, lt: hasta } },
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
