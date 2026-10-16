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
