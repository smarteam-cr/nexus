/**
 * lib/finanzas/tipo-cambio-planilla-server.ts — lee lo que necesita el aviso de tipo de cambio de la planilla
 * (2026-11-13). Server-only. Las reglas viven en tipo-cambio-planilla.ts.
 *
 * Dos lecturas, a propósito separadas:
 *   · `avisoDelTipoDeCambio`: el movimiento, SIN plata. Lo pueden ver la página del tipo de cambio (gate cobranza.read) y
 *     «Para ti» de quien supervisa Finanzas.
 *   · `cargarPlanillaEnDolares`: el movimiento CON la planilla. ⛔ Lee salarios: solo la llama la página de la planilla,
 *     después de su gate (Super Admin o la persona con «Planilla» en su override).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { montoMensual } from "./gastos";
import { sumarDias } from "./tipo-cambio";
import {
  UMBRALES_POR_DEFECTO,
  movimientoDelTipoDeCambio,
  planillaEnDolares,
  type MovimientoDelTipoDeCambio,
  type PlanillaEnDolares,
  type Umbrales,
} from "./tipo-cambio-planilla";

const ID = "planilla";

export interface UmbralesGuardados extends Umbrales {
  /** Quién los cambió por última vez y cuándo. null = valen los de siempre (3 y 5). */
  actualizadoPor: string | null;
  actualizadoEn: string | null;
}

/** Los topes del aviso. Sin fila (o sin la tabla, con el SQL sin correr), los de siempre. */
export async function cargarUmbrales(): Promise<UmbralesGuardados> {
  try {
    const f = await prisma.umbralTipoCambio.findUnique({ where: { id: ID } });
    if (!f) return { ...UMBRALES_POR_DEFECTO, actualizadoPor: null, actualizadoEn: null };
    return {
      vigilarPct: Number(f.vigilarPct),
      decidirPct: Number(f.decidirPct),
      actualizadoPor: f.actualizadoPor,
      actualizadoEn: f.updatedAt.toISOString(),
    };
  } catch (e) {
    if (!esquemaDesactualizado(e)) throw e;
    return { ...UMBRALES_POR_DEFECTO, actualizadoPor: null, actualizadoEn: null };
  }
}

/** Guarda los topes. La validación (`errorDeUmbrales`) la hace la ruta antes; la base tiene además su CHECK. */
export async function guardarUmbrales(u: Umbrales, actor: string): Promise<UmbralesGuardados> {
  const f = await prisma.umbralTipoCambio.upsert({
    where: { id: ID },
    create: { id: ID, vigilarPct: u.vigilarPct, decidirPct: u.decidirPct, actualizadoPor: actor },
    update: { vigilarPct: u.vigilarPct, decidirPct: u.decidirPct, actualizadoPor: actor },
  });
  return { vigilarPct: Number(f.vigilarPct), decidirPct: Number(f.decidirPct), actualizadoPor: f.actualizadoPor, actualizadoEn: f.updatedAt.toISOString() };
}

/** Los días del BCCR que hacen falta: el mes pasado entero (la referencia) y la última semana (la de hoy). */
async function diasRecientes(hoyISO: string): Promise<Array<{ fecha: string; venta: number }>> {
  try {
    const filas = await prisma.tipoCambioDia.findMany({
      // ~100 días: si el mes pasado no tiene días, la referencia es el anterior que sí tenga.
      where: { fecha: { gte: sumarDias(hoyISO, -100), lte: hoyISO } },
      select: { fecha: true, venta: true },
      orderBy: { fecha: "asc" },
    });
    return filas.map((f) => ({ fecha: f.fecha, venta: Number(f.venta) }));
  } catch (e) {
    if (!esquemaDesactualizado(e)) throw e;
    return [];
  }
}

export interface AvisoDelTipoDeCambio {
  movimiento: MovimientoDelTipoDeCambio | null;
  umbrales: UmbralesGuardados;
}

/** El movimiento del tipo de cambio contra la referencia. Sin plata: no lee la planilla. */
export async function avisoDelTipoDeCambio(hoyISO: string): Promise<AvisoDelTipoDeCambio> {
  const [dias, umbrales] = await Promise.all([diasRecientes(hoyISO), cargarUmbrales()]);
  return { movimiento: movimientoDelTipoDeCambio(dias, hoyISO, umbrales), umbrales };
}

export interface PlanillaYTipoDeCambio extends AvisoDelTipoDeCambio {
  planilla: PlanillaEnDolares | null;
}

/**
 * ⛔ LEE SALARIOS. El aviso, con la planilla de este mes en dólares al de hoy y al de referencia. La planilla es la
 * configuración de hoy (`CostoRecurrente` de la categoría Salario, vigentes, lo que cuestan en un mes): la misma que la
 * hoja de Planillas muestra arriba.
 */
export async function cargarPlanillaEnDolares(hoyISO: string): Promise<PlanillaYTipoDeCambio> {
  const [aviso, salarios] = await Promise.all([
    avisoDelTipoDeCambio(hoyISO),
    prisma.costoRecurrente.findMany({
      where: { categoria: "SALARIO", activo: true, OR: [{ finalizadoEl: null }, { finalizadoEl: { gte: new Date(`${hoyISO}T00:00:00Z`) } }] },
      select: { monto: true, moneda: true, frecuencia: true },
    }),
  ]);
  const planilla = aviso.movimiento
    ? planillaEnDolares(
        salarios.map((s) => ({ montoMensual: montoMensual(Number(s.monto), s.frecuencia), moneda: s.moneda })),
        aviso.movimiento,
      )
    : null;
  return { ...aviso, planilla };
}
