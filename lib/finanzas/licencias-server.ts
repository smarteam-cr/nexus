/**
 * lib/finanzas/licencias-server.ts — la señal de las licencias revendidas para el punto de equilibrio (2026-10-16).
 *
 * En la sesión con Alex salió que a kölbi, Fundauna, la UNA y Global Supply se les revenden licencias de HubSpot (el
 * gobierno no puede comprarlas directo): lo facturado por la licencia suma a lo facturado, pero el pago a HubSpot no
 * está en el gasto (medido ese día: en el gasto solo está la suscripción propia, unos US$800 al mes). Mientras no se
 * decida si las licencias salen del equilibrio o entran también como gasto, el punto de equilibrio lo avisa con la
 * evidencia que hay: los pagos grandes que salieron de Mercury a HubSpot en el año.
 *
 * Grandes = de US$1.000 para arriba. Se pagan con la tarjeta de Mercury como la suscripción propia (medido: US$18.536,82 y
 * US$16.920 en marzo, con débito), así que lo que las separa es el monto: la propia ronda los US$800 al mes.
 */
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import type { LicenciaDeContrato } from "./licencias";

export interface PagosAHubspot {
  total: number;
  pagos: number;
}

export async function pagosGrandesAHubspot(anio: number): Promise<PagosAHubspot> {
  const movimientos = await prisma.movimientoMercury.findMany({
    where: {
      estadoEspejo: "VIGENTE",
      monto: { lte: -1000 },
      contraparteNombre: { contains: "hubspot", mode: "insensitive" },
      estado: { notIn: ["failed", "cancelled", "reversed", "blocked"] },
      creadoEnMercury: { gte: new Date(`${anio}-01-01T00:00:00.000Z`), lt: new Date(`${anio + 1}-01-01T00:00:00.000Z`) },
    },
    select: { monto: true },
  });
  return {
    total: Math.round(movimientos.reduce((n, m) => n - Number(m.monto), 0) * 100) / 100,
    pagos: movimientos.length,
  };
}

/* ── Los contratos con licencias (2026-10-17, lib/finanzas/licencias.ts) ──────────────────────────────────────────── */

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Los contratos vivos (sin archivar), con el nombre del cliente. ⚠ Si la tabla no existe (el SQL de 2026-10-17 sin
 * aplicar) devuelve [] y lo dice en el log: el equilibrio vuelve a contar todo como servicio, que es lo que hacía antes
 * de kölbi. El chequeo de esquema del deploy es el que lo frena antes. Cualquier otro error se relanza.
 */
export async function cargarLicencias(): Promise<LicenciaDeContrato[]> {
  try {
    const filas = await prisma.licenciaRevendida.findMany({
      where: { archivadaEn: null },
      include: { cuenta: { select: { client: { select: { name: true } } } } },
      orderBy: { createdAt: "asc" },
    });
    return filas.map((l) => ({
      id: l.id,
      cuentaId: l.cuentaId,
      cuentaNombre: l.cuenta.client.name,
      moneda: l.moneda,
      montoContrato: Number(l.montoContrato),
      montoServicio: Number(l.montoServicio),
      proveedor: l.proveedor,
      costoMonto: l.costoMonto === null ? null : Number(l.costoMonto),
      costoMoneda: l.costoMoneda,
      costoCadaMeses: l.costoCadaMeses,
      desde: iso(l.desde),
      hasta: iso(l.hasta),
      fuente: l.fuente,
      notas: l.notas,
    }));
  } catch (e) {
    if (!esquemaDesactualizado(e)) throw e;
    console.warn("[equilibrio] no se pudieron leer las licencias revendidas (¿falta el SQL de 2026-10-17?): todo cuenta como servicio");
    return [];
  }
}
