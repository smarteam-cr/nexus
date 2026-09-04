/**
 * lib/google/auto-sync.ts
 *
 * Sync + enrich combinado con cooldown PERSISTIDO en CronJobState.
 * Se ejecuta automáticamente en background cuando el usuario usa la app.
 *
 * Cooldown: 20 minutos entre ejecuciones. Antes vivía en memoria → cada deploy
 * lo reseteaba y re-disparaba un sync completo de 365 días en el arranque del
 * contenedor (y dos corridas concurrentes tras un restart causaban P2002 en
 * meet-sync). Ahora el claim es una fila de CronJobState (tabla existente, cero
 * cambio de schema) tomada con un UPDATE condicional atómico — sobrevive
 * restarts y es seguro aunque hubiera más de una instancia.
 *
 * C-21 (2026-09-04): el claim se LEE antes de escribirse. Cada carga del shell, de /sessions
 * y de la ficha de un cliente dispara esto, y antes cada disparo hacía un upsert + un
 * updateMany que casi siempre no ganaba: dos escrituras por navegación para no hacer nada.
 * Ahora: con el cooldown vigente, una lectura y ningún write; y el proceso recuerda hasta
 * cuándo rige, así que las cargas siguientes no tocan la base. Solo se escribe cuando de
 * verdad toca correr (o cuando la fila no existe todavía).
 */

import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@prisma/client";

const JOB_KEY = "google-auto-sync";
export const COOLDOWN_MS = 20 * 60 * 1000; // 20 minutos

/** Memoria del PROCESO: el mutex, y hasta cuándo rige el cooldown que ya se vio en la base. */
export interface EstadoDeAutoSync {
  running: boolean;
  cooldownHasta: number | null;
}

/** Lo que el auto-sync necesita del mundo. Inyectable para probarlo con una base falsa. */
export interface DepsDeAutoSync {
  db: Pick<PrismaClient, "cronJobState">;
  sync(): Promise<{ synced: number; alreadyExisted: number }>;
  enrich(): Promise<{ enriched: number; skipped: number; errors: number }>;
  ahora(): Date;
  configurado(): boolean;
  estado: EstadoDeAutoSync;
}

// Guard de concurrencia DENTRO del proceso (barato; el claim de DB ya cubre
// el caso multi-proceso, esto solo evita ir a la DB en ráfagas del mismo server).
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

  const claimedAt = deps.ahora();
  // C-21: el proceso ya vio hasta cuándo rige el cooldown → ni siquiera se lee la base.
  if (estado.cooldownHasta !== null && claimedAt.getTime() < estado.cooldownHasta) {
    return { skipped: true, reason: "cooldown" };
  }
  estado.running = true;

  try {
    // C-21: LEER antes de escribir. Con el cooldown vigente esta lectura es todo lo que pasa.
    const fila = await db.cronJobState.findUnique({ where: { id: JOB_KEY }, select: { lastRunAt: true } });
    const ultimo = fila?.lastRunAt?.getTime() ?? null;
    if (ultimo !== null && claimedAt.getTime() - ultimo < COOLDOWN_MS) {
      estado.cooldownHasta = ultimo + COOLDOWN_MS;
      return { skipped: true, reason: "cooldown" };
    }

    // Claim atómico: la fila existe (se crea solo la primera vez) y el UPDATE condicional solo
    // gana si el último run fue hace ≥ COOLDOWN. count=0 → otro proceso/corrida reciente ya
    // lo tiene → skip. (updateMany = un solo UPDATE ... WHERE, atómico.)
    if (!fila) await db.cronJobState.upsert({ where: { id: JOB_KEY }, create: { id: JOB_KEY }, update: {} });
    const claim = await db.cronJobState.updateMany({
      where: {
        id: JOB_KEY,
        OR: [{ lastRunAt: null }, { lastRunAt: { lt: new Date(claimedAt.getTime() - COOLDOWN_MS) } }],
      },
      data: { lastRunAt: claimedAt },
    });
    estado.cooldownHasta = claimedAt.getTime() + COOLDOWN_MS;
    if (claim.count === 0) {
      return { skipped: true, reason: "cooldown" };
    }

    console.log("[google/auto-sync] Iniciando sync automático...");

    // 1. Sincronizar nuevas sesiones (Calendar API)
    const syncResult = await deps.sync();
    console.log(`[google/auto-sync] Sync: ${syncResult.synced} nuevas, ${syncResult.alreadyExisted} ya existían`);

    // 2. Enriquecer sesiones pendientes (Google Docs / Gemini Notes)
    const enrichResult = await deps.enrich();
    console.log(`[google/auto-sync] Enrich: ${enrichResult.enriched} enriquecidas, ${enrichResult.skipped} saltadas`);

    return { skipped: false, sync: syncResult, enrich: enrichResult };
  } catch (err) {
    console.error("[google/auto-sync] Error:", err instanceof Error ? err.message : err);
    // En error: liberar el claim (solo si sigue siendo el nuestro) para que la
    // próxima carga reintente sin esperar el cooldown completo — también en la memoria del proceso.
    estado.cooldownHasta = null;
    await db.cronJobState
      .updateMany({ where: { id: JOB_KEY, lastRunAt: claimedAt }, data: { lastRunAt: null } })
      .catch(() => {});
    return { skipped: true, reason: "error" };
  } finally {
    estado.running = false;
  }
}
