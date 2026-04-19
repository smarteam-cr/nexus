/**
 * lib/google/auto-sync.ts
 *
 * Sync + enrich combinado con cooldown en memoria.
 * Se ejecuta automáticamente en background cuando el usuario usa la app.
 *
 * Cooldown: 20 minutos entre ejecuciones (reset al reiniciar el servidor).
 */

import { syncGoogleMeetSessions } from "@/lib/google/meet-sync";
import { enrichGoogleMeetSessions } from "@/lib/google/meet-enrichment";

// ── Estado en memoria (persiste mientras el server está corriendo) ────────────

let lastRun: number | null = null;
let running = false;

const COOLDOWN_MS = 20 * 60 * 1000; // 20 minutos

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

  // Cooldown: no correr si ya corrió hace menos de 20 min
  if (lastRun && Date.now() - lastRun < COOLDOWN_MS) {
    return { skipped: true, reason: "cooldown" };
  }

  // Evitar ejecuciones concurrentes
  if (running) {
    return { skipped: true, reason: "already_running" };
  }

  running = true;
  lastRun = Date.now();

  try {
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
    // En error: resetear lastRun para que reintente en la próxima carga
    lastRun = null;
    return { skipped: true, reason: "error" };
  } finally {
    running = false;
  }
}
