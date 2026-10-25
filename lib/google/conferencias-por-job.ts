/**
 * lib/google/conferencias-por-job.ts — la revisión de las conferencias de Meet como job (`google-meet-conferencias`,
 * U3, 2026-10-25) y su disparo inmediato cuando llega un aviso de Meet (U4, lib/google/eventos-de-meet.ts).
 *
 * Mismo molde que la copia de Calendar (lib/google/copia-por-job.ts): el tick LANZA la corrida y vuelve con SIN_TURNO,
 * nunca la espera adentro (el scheduler corre los jobs en serie y ya hubo un incidente de 821 % de CPU con una corrida
 * larga adentro). La corrida, al terminar, anota su resultado en la fila del job (lo lee el semáforo de Integraciones);
 * un fallo además va a Sentry con `tags.job`.
 *
 * El turno: uno por tramo de 10 minutos, reclamado con `claimDateKey` (compare-and-set en `CronJobState`), así dos
 * procesos (el servidor y un `dev:prod` en una PC) nunca corren el mismo tramo. El disparo por aviso no reclama tramo:
 * mira solo lo que terminó hace poco, y si ya hay una corrida en vuelo en este proceso, no arranca otra.
 */
import * as Sentry from "@sentry/nextjs";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { claimDateKey } from "@/lib/jobs/registry";
import { revisarConferencias, type ResultadoDeLaRevision } from "./conferencias";

export const CLAVE_DEL_JOB = "google-meet-conferencias";
/** Cada cuánto corre la revisión completa. */
export const TRAMO_MS = 10 * 60 * 1000;

/** La clave del tramo de 10 minutos de `now` (UTC): «2026-10-25T14:3». */
export function tramoDe(now: Date): string {
  const iso = now.toISOString();
  return `${iso.slice(0, 14)}${Math.floor(now.getUTCMinutes() / 10)}`;
}

export interface DepsDeLaRevision {
  correr(urgente: boolean): Promise<ResultadoDeLaRevision>;
  anotar(resultado: Prisma.InputJsonObject): Promise<void>;
  avisar(error: Error): void;
  ahora(): Date;
}

const DEPS_REALES: DepsDeLaRevision = {
  correr: (urgente) => revisarConferencias({ urgente }),
  anotar: async (resultado) => {
    await prisma.cronJobState.upsert({
      where: { id: CLAVE_DEL_JOB },
      create: { id: CLAVE_DEL_JOB, lastResult: resultado },
      update: { lastResult: resultado },
    });
  },
  avisar: (error) => {
    Sentry.captureException(error, { tags: { job: CLAVE_DEL_JOB } });
  },
  ahora: () => new Date(),
};

let enVuelo: Promise<void> | null = null;

/**
 * Arranca una revisión sin esperarla. «en-vuelo» = ya hay una en este proceso. `urgente` = la dispara un aviso de Meet:
 * mira solo lo que terminó hace poco y no anota en la fila del job (la anota la corrida completa).
 */
export function lanzarRevision(o: { urgente?: boolean } = {}, deps: DepsDeLaRevision = DEPS_REALES): { estado: "lanzada" | "en-vuelo"; esperar: Promise<void> } {
  if (enVuelo) return { estado: "en-vuelo", esperar: enVuelo };
  const corrida = correrYAnotar(!!o.urgente, deps).finally(() => {
    enVuelo = null;
  });
  enVuelo = corrida;
  return { estado: "lanzada", esperar: corrida };
}

/** El tick del job: reclama el tramo y lanza. false = el tramo ya lo tomó otro proceso (o este). */
export async function tickDeConferencias(now: Date, deps: DepsDeLaRevision = DEPS_REALES): Promise<boolean> {
  if (enVuelo) return false;
  if (!(await claimDateKey(CLAVE_DEL_JOB, tramoDe(now), now))) return false;
  lanzarRevision({}, deps);
  return true;
}

async function correrYAnotar(urgente: boolean, deps: DepsDeLaRevision): Promise<void> {
  try {
    const r = await deps.correr(urgente);
    if (urgente) {
      if (r.miradas > 0) console.log(`[google/conferencias] por aviso de Meet: ${r.miradas} miradas, ${r.frases} frases, ${r.asistentes} asistentes`);
      return;
    }
    const at = deps.ahora().toISOString();
    await deps.anotar({ ok: true, at, ...r, cortada: r.cortada ?? null, sinTabla: r.sinTabla ?? false });
    if (r.miradas > 0) {
      console.log(
        `[jobs] ${CLAVE_DEL_JOB}: ${r.miradas} miradas (${r.ocurrieron} ocurrieron, ${r.noOcurrieron} no, ${r.sinAcceso} sin acceso), ` +
          `${r.cerradas} cerradas, ${r.frases} frases, ${r.asistentes} asistentes, ${r.aLeer} a la cola de lectura, ${r.sinCuenta} sin cuenta que lea`,
      );
    }
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`[jobs] ${CLAVE_DEL_JOB} falló: ${error.name}: ${error.message}`);
    try {
      deps.avisar(error);
      if (!urgente) await deps.anotar({ ok: false, error: `${error.name}: ${error.message}`, at: deps.ahora().toISOString() });
    } catch {
      /* Sentry y la anotación no pueden tumbar nada */
    }
  }
}
