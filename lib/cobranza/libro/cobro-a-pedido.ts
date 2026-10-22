/**
 * lib/cobranza/libro/cobro-a-pedido.ts — el cobro de lo pagado con candado, para el job de cada hora y para el botón
 * «Actualizar» (2026-10-21). Server-only.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────────────────────────────────────────
 * Revisando Finanzas con administración (2026-10-21): «Actualizar desde Odoo y Mercury» parecía no funcionar. Sí
 * copiaba (Alex lo apretó a las 16:15 y trajo 3 facturas nuevas y 3 con cambios), pero el cobro de lo pagado corría una
 * sola vez, a las 7:00: la factura conciliada llegaba pagada a la copia y la cuota seguía sin cobrar hasta el día
 * siguiente. Ahora el botón cobra después de copiar, y el job corre cada hora.
 *
 * ── EL CANDADO ───────────────────────────────────────────────────────────────────────────────────────────────────
 * Dos cobros a la vez (el de la hora y el de una persona) no escriben dos veces —cada cuota se bloquea con FOR UPDATE
 * en `escribirUnaCuota`—, pero el segundo encuentra la cuota «ya cobrada» y la cuenta como no escrita: el job se
 * pondría en rojo por una cuota que sí quedó. Mismo molde que el candado de la copia de Odoo (odoo/sync.ts).
 *
 * ⛔ No decide QUÉ se cobra: eso es `correrElCobroDelDia` (servicio.ts) y la regla de aplicar.ts y hechos.ts.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { motivoApagado } from "@/lib/jobs/requisitos";
import type { CobroDeLoPagado } from "@/lib/finanzas/actualizar-tablero";
import { correrElCobroDelDia } from "./servicio";

const CANDADO = "lo-pagado-candado";
/** Un cobro tarda segundos. Si el proceso murió con el candado puesto, a los 10 minutos se da por suelto. */
const CANDADO_VENCE_MS = 10 * 60 * 1000;

async function tomarCandado(ahora: Date): Promise<boolean> {
  await prisma.cronJobState.createMany({ data: [{ id: CANDADO }], skipDuplicates: true });
  const tomado = await prisma.cronJobState.updateMany({
    where: { id: CANDADO, OR: [{ lastRunAt: null }, { lastRunAt: { lt: new Date(ahora.getTime() - CANDADO_VENCE_MS) } }] },
    data: { lastRunAt: ahora },
  });
  return tomado.count === 1;
}

/** ⛔ Nunca lanza: corre en un `finally`, y un fallo al soltar no puede tapar el resultado del cobro. */
async function soltarCandado(): Promise<void> {
  await prisma.cronJobState.updateMany({ where: { id: CANDADO }, data: { lastRunAt: null } }).catch(() => {});
}

type DelDia = Awaited<ReturnType<typeof correrElCobroDelDia>>;

/** `correrElCobroDelDia` con el candado. `enCurso` = otro cobro estaba corriendo: este no hizo nada. */
export async function correrElCobroConCandado(
  now: Date,
  opciones: Parameters<typeof correrElCobroDelDia>[1],
): Promise<({ enCurso: false } & DelDia) | { enCurso: true }> {
  if (!(await tomarCandado(now))) return { enCurso: true };
  try {
    return { enCurso: false, ...(await correrElCobroDelDia(now, opciones)) };
  } finally {
    await soltarCandado();
  }
}

/**
 * El cobro que pide una persona con «Actualizar», después de las copias. Cobra a cualquier hora (`ignorarLaHora`) con
 * las copias que corrieron bien hoy, firmado por el sistema igual que el de la hora: adelanta lo que el job haría solo.
 * ⛔ Nunca lanza: el fallo vuelve como `FALLO`, y lo copiado queda igual.
 */
export async function cobrarLoPagadoAhora(actor: string, now: Date = new Date()): Promise<CobroDeLoPagado> {
  if (motivoApagado("lo-pagado-daily", process.env) !== null) return { estado: "APAGADO" };
  try {
    const r = await correrElCobroConCandado(now, { aplicar: true, ignorarLaHora: true });
    if (r.enCurso) return { estado: "EN_CURSO" };
    const res = r.resultado;
    if (!res) return { estado: "HECHO", cobradas: [], quedan: 0, sinElDiaDelPago: 0, atrasadas: r.turno.atrasadas, noSePudieron: [], avisoOdoo: null };
    console.log(
      `[cobranza/cobro-a-pedido] pedido por ${actor} — cobradas solas: ${res.cobradas.length} · quedan para una persona: ${res.quedan.length} · ` +
        `sin el día del pago: ${res.pagadasSinFecha}${res.saltadas.length ? ` · no se pudieron: ${res.saltadas.length}` : ""}`,
    );
    return {
      estado: "HECHO",
      cobradas: res.cobradas,
      quedan: res.quedan.length,
      sinElDiaDelPago: res.pagadasSinFecha,
      atrasadas: r.turno.atrasadas,
      noSePudieron: res.saltadas,
      avisoOdoo: res.avisoOdoo,
    };
  } catch (e) {
    console.error(`[cobranza/cobro-a-pedido] falló: ${e instanceof Error ? e.message : String(e)}`);
    return { estado: "FALLO", error: e instanceof Error ? e.message : String(e) };
  }
}
