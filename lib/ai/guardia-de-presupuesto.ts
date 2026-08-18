/**
 * lib/ai/guardia-de-presupuesto.ts — LA PARTE DEL PRESUPUESTO QUE NECESITA LA BASE.
 *
 * `presupuesto.ts` decide; esto le dice cuánto se lleva gastado hoy. Lo llama `lib/anthropic.ts`
 * ANTES de cada llamada a Claude.
 *
 * ── ⚠ POR QUÉ ES SÍNCRONO Y CON CACHÉ, Y NO UNA CONSULTA POR LLAMADA ─────────
 * Dos razones, y la segunda no es negociable:
 *  1. Una consulta de agregación por cada llamada a Claude le suma latencia a todo el sistema para
 *     responder algo que cambia de a centavos.
 *  2. `messages.stream` NO es async: devuelve el stream en el acto. Un chequeo que hubiera que
 *     esperar no se puede intercalar ahí sin cambiarle la forma al SDK.
 *
 * Entonces: el gasto del día vive en memoria, se refresca en segundo plano cada
 * `FRESCURA_MS`, y la lectura es instantánea.
 *
 * ── ⛔ LA REGLA QUE GOBIERNA ESTE ARCHIVO ────────────────────────────────────
 * **Lo que no se sabe, no frena.** Mientras la caché esté vacía —arranque del proceso, base caída,
 * migración sin correr— el gasto es `null` y `evaluarPresupuesto` no excede nunca. Un tope que
 * cortara por no haber podido leer la base tumbaría todos los agentes por un problema que no es de
 * gasto: el instrumento no puede ser la causa del incidente que mide.
 *
 * El costo de esa decisión, dicho: en el primer minuto de vida de un proceso el tope no protege.
 * Es el intercambio correcto, y por eso el refresco arranca al primer uso y no al primer minuto.
 */
import { prisma } from "@/lib/db/prisma";
import { claseDeGasto, contextoDeIA, type ClaseDeGasto } from "./contexto-de-corrida";
import {
  evaluarPresupuesto,
  inicioDelDiaCr,
  limitesDelEntorno,
  PresupuestoDeIaAgotado,
  type Veredicto,
} from "./presupuesto";

/** Cada cuánto se vuelve a preguntar el gasto del día. */
const FRESCURA_MS = 60_000;

interface Cache {
  /** Día de Costa Rica al que corresponde el gasto — si cambia, la caché no sirve. */
  dia: string;
  gasto: Record<ClaseDeGasto, number>;
  leidoEn: number;
}

let cache: Cache | null = null;
let refrescando: Promise<void> | null = null;

/** Solo para tests: vuelve la guardia a su estado de arranque. */
export function _reiniciarCacheDePresupuesto(): void {
  cache = null;
  refrescando = null;
}

async function refrescar(ahora: Date): Promise<void> {
  const desde = inicioDelDiaCr(ahora);
  const dia = desde.toISOString().slice(0, 10);
  // Dos agregados en vez de un groupBy: `triggeredByEmail` es texto libre y agrupar por él
  // devolvería una fila por persona, que no es la pregunta.
  const [humano, automatico] = await Promise.all([
    prisma.llmCall.aggregate({
      _sum: { costUsd: true },
      where: { at: { gte: desde }, NOT: { triggeredByEmail: null } },
    }),
    prisma.llmCall.aggregate({
      _sum: { costUsd: true },
      where: { at: { gte: desde }, triggeredByEmail: null },
    }),
  ]);
  cache = {
    dia,
    gasto: {
      humano: humano._sum.costUsd ?? 0,
      automatico: automatico._sum.costUsd ?? 0,
    },
    leidoEn: ahora.getTime(),
  };
}

/** Dispara el refresco si hace falta, sin esperarlo y sin poder romper nada. */
function refrescarSiHaceFalta(ahora: Date): void {
  const dia = inicioDelDiaCr(ahora).toISOString().slice(0, 10);
  const vigente = cache && cache.dia === dia && ahora.getTime() - cache.leidoEn < FRESCURA_MS;
  if (vigente || refrescando) return;
  refrescando = refrescar(ahora)
    .catch((e) => {
      // A propósito `console.error` y no `report-error`: si la base está caída, el reporte de
      // errores probablemente también. La caché queda como estaba y el tope no frena.
      console.error("[presupuesto] no se pudo leer el gasto del día:", e instanceof Error ? e.message : e);
    })
    .finally(() => {
      refrescando = null;
    });
}

/** El gasto conocido de esa clase hoy, o `null` si todavía no se sabe. */
function gastoConocido(clase: ClaseDeGasto, ahora: Date): number | null {
  const dia = inicioDelDiaCr(ahora).toISOString().slice(0, 10);
  if (!cache || cache.dia !== dia) return null;
  return cache.gasto[clase];
}

/**
 * Revisa el presupuesto de la llamada que está por salir. Nunca espera: lee la caché y dispara el
 * refresco de fondo.
 *
 * ⛔ **Lanza `PresupuestoDeIaAgotado` solo con el bloqueo encendido.** El default es avisar: la
 * llamada sale igual y queda el `console.warn`. Ver el porqué en `presupuesto.ts`.
 */
export function revisarPresupuestoAntesDeLlamar(ahora: Date = new Date()): Veredicto {
  const clase = claseDeGasto(contextoDeIA());
  refrescarSiHaceFalta(ahora);
  const v = evaluarPresupuesto(clase, gastoConocido(clase, ahora), limitesDelEntorno());
  if (v.excedido) console.warn(`[presupuesto] ${v.mensaje}`);
  if (v.bloquea) throw new PresupuestoDeIaAgotado(v);
  return v;
}
