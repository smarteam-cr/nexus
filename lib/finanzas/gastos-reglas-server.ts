/**
 * lib/finanzas/gastos-reglas-server.ts — lo que escriben «este gasto se repite» y «ya tengo la factura» (2026-11-13).
 * Server-only. Las reglas viven en reglas-de-gasto.ts.
 *
 * ⛔ PRIVACIDAD: lo llaman rutas de quien registra (`gastos.write`). El fijo que nace de un gasto es herramienta o fijo de
 * operación, nunca un salario (el esquema de la ruta solo acepta esas dos categorías).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { CobranzaError, createCosto } from "@/lib/cobranza/mutations";
import { crDateParts } from "@/lib/jobs/time";
import { etiquetaMes } from "./gastos";
import { fijoDesde } from "./reglas-de-gasto";
import type { CategoriaSinSalario } from "./gastos";

const MESES_DEL_FIJO = (desdeISO: string) => etiquetaMes(desdeISO.slice(0, 7), true);

/**
 * El gasto puntual se vuelve un fijo: nace un recurrente con su nombre, su monto y su moneda, que cuenta desde el mes que
 * SIGUE al del gasto (`fijoDesde`). El gasto se queda en su mes, atado al fijo. Nada se borra: el mes del gasto ya tiene
 * su gasto, y los siguientes los proyecta el fijo (lib/finanzas/egresos-nexus.ts y la caja neta, como cualquier otro).
 *
 * Funciona aunque el mes del gasto esté cerrado: no cambia ningún monto de ese mes. 409 si el gasto ya es un fijo.
 */
export async function volverFijo(
  gastoId: string,
  datos: { categoria: CategoriaSinSalario; frecuencia: "MENSUAL" | "ANUAL"; presupuesto?: number | null },
  actor: string,
): Promise<{ costoId: string; desde: string }> {
  const g = await prisma.gastoPuntual.findUnique({
    where: { id: gastoId },
    select: { nombre: true, monto: true, moneda: true, fecha: true, pasoAFijoId: true },
  });
  if (!g) throw new CobranzaError("El gasto no existe.", 404);
  if (g.pasoAFijoId) throw new CobranzaError("Este gasto ya es un fijo.", 409);
  const fechaISO = g.fecha.toISOString().slice(0, 10);
  const desde = fijoDesde(fechaISO);
  const hoy = crDateParts(new Date()).dateKey;
  const { id } = await createCosto(
    {
      categoria: datos.categoria,
      nombre: g.nombre,
      monto: Number(g.monto),
      moneda: g.moneda,
      frecuencia: datos.frecuencia,
      presupuesto: datos.presupuesto ?? null,
      notas: `Era el gasto del ${fechaISO}; cuenta como fijo desde ${MESES_DEL_FIJO(desde > hoy ? desde : hoy)}.`,
      fechaEfectiva: desde,
      motivoMovimiento: "Un gasto puntual que se repite",
    },
    actor,
    async (tx, costoId) => {
      // Solo si nadie lo volvió fijo mientras tanto: si no, la transacción entera se cae y no queda un fijo de más.
      const r = await tx.gastoPuntual.updateMany({ where: { id: gastoId, pasoAFijoId: null }, data: { pasoAFijoId: costoId } });
      if (r.count !== 1) throw new CobranzaError("Este gasto ya es un fijo.", 409);
    },
  );
  return { costoId: id, desde };
}

/**
 * Anota (o quita) la factura de un gasto. Se puede con el mes cerrado: la factura llega después y no cambia ningún monto.
 * Queda quién la anotó y cuándo.
 */
export async function anotarComprobante(gastoId: string, comprobante: string | null, actor: string): Promise<void> {
  const r = await prisma.gastoPuntual.updateMany({
    where: { id: gastoId },
    data: comprobante
      ? { comprobante, comprobantePor: actor, comprobanteEn: new Date() }
      : { comprobante: null, comprobantePor: null, comprobanteEn: null },
  });
  if (r.count === 0) throw new CobranzaError("El gasto no existe.", 404);
}
