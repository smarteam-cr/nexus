/**
 * lib/google/copia-por-job.ts — la copia de Google Meet como job del scheduler (`google-meet-sync`, U1, 2026-10-25).
 *
 * Hasta U1 la copia de Calendar y la lectura de los Docs corrían SOLO cuando alguien abría Nexus, con 20 minutos de
 * espera: un sábado sin nadie en la app, la última copia buena tenía casi dos horas (medido el 2026-10-24). Ahora la
 * corre el scheduler cada 10 minutos, contados desde el FIN de la anterior.
 *
 * ⚠ No espera dentro del tick. El scheduler corre los jobs en serie y ya hubo un incidente de 821 % de CPU
 * (2026-09-21) con una corrida larga adentro: `lanzarCopiaDeMeet` arranca la corrida y vuelve enseguida, y el job
 * devuelve SIN_TURNO para que el scheduler no anote un «ok» de algo que no terminó. La corrida, al terminar, anota su
 * resultado en la fila del job (`lastRunAt` = cuándo arrancó, `lastResult` = `{ ok, at, … }`), que es lo que lee el
 * semáforo de Integraciones; un fallo además va a Sentry con `tags.job`.
 *
 * ⚠ El turno es el MISMO que el del disparo al abrir la app (`autoSyncGoogleMeet`, fila `google-auto-sync`): nunca
 * corren a la vez, ni en este proceso ni entre procesos (un `dev:prod` en una PC). Con el turno tomado o en espera, la
 * llamada vuelve sin escribir nada. Medido el 2026-10-24: una corrida completa dura unos 7 s (6 s de calendarios para
 * 23 cuentas), así que no hace falta `syncToken` todavía (U4).
 */
import * as Sentry from "@sentry/nextjs";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { autoSyncGoogleMeet } from "./auto-sync";

export const CLAVE_DEL_JOB = "google-meet-sync";
/** La espera entre corridas del job, contada desde el fin de la anterior. */
export const ESPERA_DEL_JOB_MS = 10 * 60 * 1000;

type Corrida = Awaited<ReturnType<typeof autoSyncGoogleMeet>>;

/** Lo que el job necesita del mundo. Inyectable para probarlo sin base ni Google. */
export interface DepsDeLaCopia {
  correr(): Promise<Corrida>;
  anotar(inicio: Date, resultado: Prisma.InputJsonObject): Promise<void>;
  avisar(error: Error): void;
  ahora(): Date;
}

const DEPS_REALES: DepsDeLaCopia = {
  correr: () => autoSyncGoogleMeet(undefined, { cooldownMs: ESPERA_DEL_JOB_MS }),
  anotar: async (inicio, resultado) => {
    await prisma.cronJobState.upsert({
      where: { id: CLAVE_DEL_JOB },
      create: { id: CLAVE_DEL_JOB, lastRunAt: inicio, lastResult: resultado },
      update: { lastRunAt: inicio, lastResult: resultado },
    });
  },
  avisar: (error) => {
    Sentry.captureException(error, { tags: { job: CLAVE_DEL_JOB } });
  },
  ahora: () => new Date(),
};

let enVuelo: Promise<void> | null = null;

/**
 * Arranca una corrida de la copia sin esperarla. «en-vuelo» = ya hay una de este job en este proceso. La promesa que
 * devuelve `esperar` es solo para las pruebas: el job nunca la espera.
 */
export function lanzarCopiaDeMeet(deps: DepsDeLaCopia = DEPS_REALES): { estado: "lanzada" | "en-vuelo"; esperar: Promise<void> } {
  if (enVuelo) return { estado: "en-vuelo", esperar: enVuelo };
  const corrida = correrYAnotar(deps).finally(() => {
    enVuelo = null;
  });
  enVuelo = corrida;
  return { estado: "lanzada", esperar: corrida };
}

/** Corre la copia y anota cómo terminó. Nunca lanza: corre fuera del try/catch del scheduler. */
async function correrYAnotar(deps: DepsDeLaCopia): Promise<void> {
  const inicio = deps.ahora();
  try {
    const r = await deps.correr();
    // Sin turno (en espera, o la otra vía lo tiene): no corrió, no se anota nada.
    if (r.skipped && r.reason !== "error") return;
    const at = deps.ahora().toISOString();
    if (r.skipped) {
      const error = new Error(`La copia de Google Meet falló: ${r.error ?? "sin detalle"}`);
      error.name = "CopiaDeMeetFallida";
      console.error(`[jobs] ${CLAVE_DEL_JOB} falló: ${error.message}`);
      deps.avisar(error);
      await deps.anotar(inicio, { ok: false, error: `${error.name}: ${error.message}`, at });
      return;
    }
    await deps.anotar(inicio, {
      ok: true,
      at,
      duracionSeg: r.duracionSeg ?? null,
      nuevas: r.sync?.synced ?? 0,
      canceladas: r.sync?.canceladas ?? 0,
      invitados: r.sync?.invitados ?? 0,
      enriquecidas: r.enrich?.enriched ?? 0,
    });
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`[jobs] ${CLAVE_DEL_JOB}: no se pudo anotar la corrida: ${error.name}: ${error.message}`);
    try {
      deps.avisar(error);
    } catch {
      /* Sentry no puede tumbar nada */
    }
  }
}
