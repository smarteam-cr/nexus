/**
 * lib/google/auto-sync.ts
 *
 * Sync + enrich combinado con turno PERSISTIDO en CronJobState.
 * Se ejecuta automáticamente en background cuando el usuario usa la app (lo disparan el shell,
 * /sessions y la ficha de un cliente por POST /api/integrations/google/auto-sync).
 *
 * Historia:
 * - El cooldown vivía en memoria → cada deploy lo reseteaba y re-disparaba un sync completo en el
 *   arranque del contenedor. Pasó a una fila de CronJobState tomada con un UPDATE condicional
 *   atómico — sobrevive restarts y es seguro aunque hubiera más de una instancia.
 * - C-21 (2026-09-04): el turno se LEE antes de escribirse. Con el cooldown vigente, una lectura y
 *   ningún write; y el proceso recuerda hasta cuándo rige, así que las cargas siguientes no tocan
 *   la base.
 * - FRENO (2026-09-21, incidente de 821 % de CPU): el cooldown de 20 min se contaba desde el
 *   ARRANQUE y las corridas duraban 6–15 min, así que el proceso web pasaba la mayor parte del día
 *   adentro de una. Y al fallar se liberaba el turno: la carga siguiente volvía a correr todo, en
 *   bucle. Ahora:
 *     · el cooldown cuenta desde el FIN de la corrida;
 *     · si falla, espera (5, 10, 20, 40 min… hasta 60) antes de reintentar;
 *     · el turno tiene VENCIMIENTO: si el proceso muere a mitad, se libera solo a la hora, y
 *       mientras tanto nadie arranca otra (ni al reiniciar el contenedor).
 *
 * ⚠ La columna `lastRunAt` de la fila `google-auto-sync` ya NO es «cuándo arrancó la última»:
 * es «no correr antes de». Mientras corre, vale el vencimiento del turno; al terminar, el fin más
 * el cooldown (o más la espera, si falló). Se reusa la columna para no cambiar el schema.
 * `lastResult` guarda cómo terminó la última: `{ at, ok, fallosSeguidos, … }`.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

const JOB_KEY = "google-auto-sync";
/** Espera entre corridas, contada desde el FIN de la anterior. */
export const COOLDOWN_MS = 20 * 60 * 1000;
/** Vencimiento del turno: si el proceso muere a mitad de una corrida, a esta hora se libera solo. */
export const VENCE_TURNO_MS = 60 * 60 * 1000;
/** Espera tras el primer fallo; se duplica con cada fallo seguido hasta `ESPERA_TOPE_MS`. */
export const ESPERA_BASE_MS = 5 * 60 * 1000;
export const ESPERA_TOPE_MS = 60 * 60 * 1000;

/** Cuánto esperar antes de reintentar después de `fallosSeguidos` fallos (≥ 1): 5, 10, 20, 40, 60, 60… min. */
export function esperaTrasFallo(fallosSeguidos: number): number {
  const n = Math.max(1, Math.floor(fallosSeguidos));
  return Math.min(ESPERA_BASE_MS * 2 ** (n - 1), ESPERA_TOPE_MS);
}

/** Los fallos seguidos que anotó la última corrida en `lastResult` (0 si no hay nada legible). */
export function fallosSeguidosDe(lastResult: Prisma.JsonValue | null): number {
  if (!lastResult || typeof lastResult !== "object" || Array.isArray(lastResult)) return 0;
  const n = lastResult.fallosSeguidos;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Memoria del PROCESO: el mutex, y hasta cuándo no vale la pena ni mirar la base. */
export interface EstadoDeAutoSync {
  running: boolean;
  cooldownHasta: number | null;
}

/** Las dos formas de condición que usa el turno: tomarlo (libre o vencido) y cerrarlo (si sigue siendo nuestro). */
export type DondeDelTurno =
  | { id: string; OR: Array<{ lastRunAt: null } | { lastRunAt: { lte: Date } }> }
  | { id: string; lastRunAt: Date };

/** Lo que el auto-sync usa de CronJobState, nada más: así se prueba con una tabla falsa. */
export interface DbDeTurnos {
  cronJobState: {
    findUnique(args: {
      where: { id: string };
      select: { lastRunAt: true; lastResult: true };
    }): PromiseLike<{ lastRunAt: Date | null; lastResult: Prisma.JsonValue | null } | null>;
    upsert(args: { where: { id: string }; create: { id: string }; update: Record<string, never> }): PromiseLike<unknown>;
    updateMany(args: {
      where: DondeDelTurno;
      data: { lastRunAt: Date; lastResult?: Prisma.InputJsonValue };
    }): PromiseLike<{ count: number }>;
  };
}

/** Lo que el auto-sync necesita del mundo. Inyectable para probarlo con una base falsa. */
export interface DepsDeAutoSync {
  db: DbDeTurnos;
  sync(): Promise<{ synced: number; alreadyExisted: number }>;
  enrich(): Promise<{ enriched: number; skipped: number; errors: number }>;
  ahora(): Date;
  configurado(): boolean;
  estado: EstadoDeAutoSync;
}

// Mutex DENTRO del proceso: nunca dos corridas a la vez acá adentro. El turno de la base cubre el
// caso de varios procesos.
const ESTADO: EstadoDeAutoSync = { running: false, cooldownHasta: null };

const DEPS_REALES: DepsDeAutoSync = {
  db: prisma,
  /* Bajo demanda a propósito: los dos módulos arrastran googleapis y el SDK de IA. Se cargan
     la primera vez que de verdad toca correr, no al importar este archivo (ni en los tests). */
  sync: async () => (await import("@/lib/google/meet-sync")).syncGoogleMeetSessions(),
  enrich: async () => (await import("@/lib/google/meet-enrichment")).enrichGoogleMeetSessions(),
  ahora: () => new Date(),
  configurado: () => !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY && !!process.env.GOOGLE_ADMIN_EMAIL,
  estado: ESTADO,
};

/** Cierra el turno SOLO si sigue siendo nuestro: si venció y lo tomó otro, no se le pisa. */
async function cerrarTurno(db: DbDeTurnos, turno: Date, noAntesDe: number, resultado: Prisma.InputJsonValue): Promise<void> {
  try {
    await db.cronJobState.updateMany({
      where: { id: JOB_KEY, lastRunAt: turno },
      data: { lastRunAt: new Date(noAntesDe), lastResult: resultado },
    });
  } catch (err) {
    // Si no se puede cerrar, el turno queda hasta su vencimiento: una espera más larga, nunca una corrida doble.
    console.error("[google/auto-sync] No se pudo cerrar el turno:", err instanceof Error ? err.message : err);
  }
}

// ── Función pública ───────────────────────────────────────────────────────────

export async function autoSyncGoogleMeet(deps: DepsDeAutoSync = DEPS_REALES): Promise<{
  skipped: boolean;
  reason?: string;
  sync?: { synced: number; alreadyExisted: number };
  enrich?: { enriched: number; skipped: number; errors: number };
}> {
  // Verificar que las credenciales existen
  if (!deps.configurado()) {
    return { skipped: true, reason: "google_not_configured" };
  }

  const { estado, db } = deps;
  if (estado.running) {
    return { skipped: true, reason: "already_running" };
  }

  const inicio = deps.ahora().getTime();
  // C-21: el proceso ya sabe hasta cuándo no toca → ni siquiera se lee la base.
  if (estado.cooldownHasta !== null && inicio < estado.cooldownHasta) {
    return { skipped: true, reason: "cooldown" };
  }
  estado.running = true;

  let turno: Date | null = null;
  let fallosPrevios = 0;
  try {
    // C-21: LEER antes de escribir. Con el turno bloqueado esta lectura es todo lo que pasa.
    const fila = await db.cronJobState.findUnique({ where: { id: JOB_KEY }, select: { lastRunAt: true, lastResult: true } });
    const noAntesDe = fila?.lastRunAt?.getTime() ?? null;
    if (noAntesDe !== null && inicio < noAntesDe) {
      estado.cooldownHasta = noAntesDe;
      return { skipped: true, reason: "cooldown" };
    }
    fallosPrevios = fallosSeguidosDe(fila?.lastResult ?? null);

    // Turno atómico: la fila existe (se crea solo la primera vez) y el UPDATE condicional solo gana
    // si está libre o vencido. count=0 → otro proceso lo tomó entre la lectura y acá → skip.
    if (!fila) await db.cronJobState.upsert({ where: { id: JOB_KEY }, create: { id: JOB_KEY }, update: {} });
    const vence = new Date(inicio + VENCE_TURNO_MS);
    const claim = await db.cronJobState.updateMany({
      where: { id: JOB_KEY, OR: [{ lastRunAt: null }, { lastRunAt: { lte: new Date(inicio) } }] },
      data: { lastRunAt: vence },
    });
    if (claim.count === 0) {
      return { skipped: true, reason: "cooldown" };
    }
    turno = vence;
    estado.cooldownHasta = vence.getTime();

    console.log("[google/auto-sync] Iniciando sync automático...");

    // 1. Sincronizar nuevas sesiones (Calendar API)
    const syncResult = await deps.sync();
    console.log(`[google/auto-sync] Sync: ${syncResult.synced} nuevas, ${syncResult.alreadyExisted} ya existían`);

    // 2. Enriquecer sesiones pendientes (Google Docs / Gemini Notes)
    const enrichResult = await deps.enrich();
    console.log(`[google/auto-sync] Enrich: ${enrichResult.enriched} enriquecidas, ${enrichResult.skipped} saltadas`);

    // El cooldown cuenta desde ACÁ, el fin: una corrida larga no deja al proceso encadenando otra.
    const fin = deps.ahora().getTime();
    const proxima = fin + COOLDOWN_MS;
    estado.cooldownHasta = proxima;
    await cerrarTurno(db, turno, proxima, {
      at: new Date(fin).toISOString(),
      ok: true,
      fallosSeguidos: 0,
      duracionSeg: Math.round((fin - inicio) / 1000),
      sync: { nuevas: syncResult.synced, existentes: syncResult.alreadyExisted },
      enrich: { enriquecidas: enrichResult.enriched, saltadas: enrichResult.skipped, errores: enrichResult.errors },
    });
    return { skipped: false, sync: syncResult, enrich: enrichResult };
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    console.error("[google/auto-sync] Error:", mensaje);
    // Fallo → ESPERA antes de reintentar (antes se liberaba el turno y la carga siguiente volvía a
    // correr todo, en bucle, sobre un proceso que quizás fallaba justamente por estar saturado).
    const fin = deps.ahora().getTime();
    const fallos = fallosPrevios + 1;
    const proxima = fin + esperaTrasFallo(fallos);
    estado.cooldownHasta = proxima;
    // Sin turno (falló la lectura o el claim: la base no respondió) no hay nada que cerrar; el
    // proceso igual espera en memoria.
    if (turno) {
      await cerrarTurno(db, turno, proxima, {
        at: new Date(fin).toISOString(),
        ok: false,
        error: mensaje.slice(0, 300),
        fallosSeguidos: fallos,
      });
    }
    return { skipped: true, reason: "error" };
  } finally {
    estado.running = false;
  }
}
