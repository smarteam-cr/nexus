/**
 * lib/jobs/estado.ts — QUÉ PASÓ LA ÚLTIMA VEZ QUE CORRIÓ CADA JOB.
 *
 * B-03 (auditoría 2026-09-03): `CronJobState.lastResult` existía como columna pero solo la usaba
 * el sync de partner, bajo una clave que no es un job. El scheduler no dejaba rastro: un job que
 * fallaba todos los días desde hacía semanas se veía igual que uno que corría bien. Ahora el
 * scheduler escribe acá el resultado de cada corrida —`{ok:true, at}` o `{ok:false, error, at}`—
 * bajo la clave del job, y el semáforo de Integraciones lo lee. Sin SQL: la columna ya estaba.
 *
 * ⚠ `registrarResultado` NUNCA lanza: corre dentro del catch del scheduler, y un fallo al anotar el
 * fallo no puede tumbar el tick ni al job siguiente. Si no se puede escribir, se dice por consola.
 *
 * Los jobs que corren cada minuto (watchdog, reintentos de Google) escribirían 60 veces por hora:
 * el `ok` se anota como mucho cada 10 minutos por job; un fallo se anota SIEMPRE, y el primer `ok`
 * después de un fallo también.
 *
 * ⚠ No se libera el claim del día cuando un job falla (quedó fuera de B-03 a propósito): un
 * reintento automático cada minuto sobre un job que hizo la mitad del trabajo —emitir cobros,
 * publicar en marketing— puede duplicar efectos. Qué jobs son seguros de reintentar es una
 * decisión de negocio, no del scheduler; el semáforo hace visible el fallo para que alguien la tome.
 */
import { prisma } from "@/lib/db/prisma";

export type ResultadoDeJob = { ok: true; at: string } | { ok: false; error: string; at: string };

export interface EstadoDeJob {
  key: string;
  /** Último claim del día (solo los jobs diarios lo estampan). */
  lastRunAt: Date | null;
  lastRunDateKey: string | null;
  /** Lo que escribió el scheduler; null = nunca corrió desde que existe el registro. */
  resultado: ResultadoDeJob | null;
}

/** Cada cuánto, como mucho, se re-anota un `ok` del mismo job. */
export const REZAGO_MAXIMO_DE_OK_MS = 10 * 60 * 1000;

const ultimoOkAnotado = new Map<string, number>();

export async function registrarResultado(jobKey: string, resultado: ResultadoDeJob): Promise<void> {
  const t = Date.parse(resultado.at);
  if (resultado.ok) {
    const previo = ultimoOkAnotado.get(jobKey);
    if (previo !== undefined && t - previo < REZAGO_MAXIMO_DE_OK_MS) return;
    ultimoOkAnotado.set(jobKey, t);
  } else {
    ultimoOkAnotado.delete(jobKey);
  }
  try {
    await prisma.cronJobState.upsert({
      where: { id: jobKey },
      create: { id: jobKey, lastResult: resultado },
      update: { lastResult: resultado },
    });
  } catch (e) {
    console.error(
      `[jobs] no se pudo registrar el resultado de ${jobKey}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

function esResultado(v: unknown): v is ResultadoDeJob {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  if (typeof r.at !== "string") return false;
  if (r.ok === true) return true;
  return r.ok === false && typeof r.error === "string";
}

/** El estado de cada job pedido, en el orden pedido; los que nunca corrieron salen con nulls. */
export async function leerEstadoDeJobs(keys: string[]): Promise<EstadoDeJob[]> {
  const filas = await prisma.cronJobState.findMany({
    where: { id: { in: keys } },
    select: { id: true, lastRunAt: true, lastRunDateKey: true, lastResult: true },
  });
  const porClave = new Map(filas.map((f) => [f.id, f]));
  return keys.map((key) => {
    const f = porClave.get(key);
    const crudo: unknown = f?.lastResult ?? null;
    return {
      key,
      lastRunAt: f?.lastRunAt ?? null,
      lastRunDateKey: f?.lastRunDateKey ?? null,
      resultado: esResultado(crudo) ? crudo : null,
    };
  });
}
