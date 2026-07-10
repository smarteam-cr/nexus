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
 */

import { prisma } from "@/lib/db/prisma";
import { syncGoogleMeetSessions } from "@/lib/google/meet-sync";
import { enrichGoogleMeetSessions } from "@/lib/google/meet-enrichment";

const JOB_KEY = "google-auto-sync";
const COOLDOWN_MS = 20 * 60 * 1000; // 20 minutos

// Guard de concurrencia DENTRO del proceso (barato; el claim de DB ya cubre
// el caso multi-proceso, esto solo evita ir a la DB en ráfagas del mismo server).
let running = false;

// ── Función pública ───────────────────────────────────────────────────────────

export async function autoSyncGoogleMeet(): Promise<{
  skipped: boolean;
  reason?: string;
  sync?: { synced: number; alreadyExisted: number };
  enrich?: { enriched: number; skipped: number; errors: number };
}> {
  // Verificar que las credenciales existen
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY || !process.env.GOOGLE_ADMIN_EMAIL) {
    return { skipped: true, reason: "google_not_configured" };
  }

  if (running) {
    return { skipped: true, reason: "already_running" };
  }
  running = true;

  const claimedAt = new Date();
  try {
    // Claim atómico: la fila existe (upsert) y el UPDATE condicional solo gana
    // si el último run fue hace ≥ COOLDOWN. count=0 → otro proceso/corrida
    // reciente ya lo tiene → skip. (updateMany = un solo UPDATE ... WHERE, atómico.)
    await prisma.cronJobState.upsert({ where: { id: JOB_KEY }, create: { id: JOB_KEY }, update: {} });
    const claim = await prisma.cronJobState.updateMany({
      where: {
        id: JOB_KEY,
        OR: [{ lastRunAt: null }, { lastRunAt: { lt: new Date(claimedAt.getTime() - COOLDOWN_MS) } }],
      },
      data: { lastRunAt: claimedAt },
    });
    if (claim.count === 0) {
      return { skipped: true, reason: "cooldown" };
    }

    console.log("[google/auto-sync] Iniciando sync automático...");

    // 1. Sincronizar nuevas sesiones (Calendar API)
    const syncResult = await syncGoogleMeetSessions();
    console.log(`[google/auto-sync] Sync: ${syncResult.synced} nuevas, ${syncResult.alreadyExisted} ya existían`);

    // 2. Enriquecer sesiones pendientes (Google Docs / Gemini Notes)
    const enrichResult = await enrichGoogleMeetSessions();
    console.log(`[google/auto-sync] Enrich: ${enrichResult.enriched} enriquecidas, ${enrichResult.skipped} saltadas`);

    return { skipped: false, sync: syncResult, enrich: enrichResult };
  } catch (err) {
    console.error("[google/auto-sync] Error:", err instanceof Error ? err.message : err);
    // En error: liberar el claim (solo si sigue siendo el nuestro) para que la
    // próxima carga reintente sin esperar el cooldown completo.
    await prisma.cronJobState
      .updateMany({ where: { id: JOB_KEY, lastRunAt: claimedAt }, data: { lastRunAt: null } })
      .catch(() => {});
    return { skipped: true, reason: "error" };
  } finally {
    running = false;
  }
}
