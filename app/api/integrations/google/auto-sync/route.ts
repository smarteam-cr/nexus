import { NextResponse } from "next/server";
import { autoSyncGoogleMeet } from "@/lib/google/auto-sync";
import { guardInternalUser } from "@/lib/auth/api-guards";

/**
 * POST /api/integrations/google/auto-sync
 *
 * Endpoint ligero para disparar sync+enrich desde el cliente (fire-and-forget).
 * El freno vive en `autoSyncGoogleMeet` (lib/google/auto-sync.ts, incidente 2026-09-21): turno en
 * CronJobState con vencimiento, cooldown de 20 min contado desde el FIN de la corrida, espera
 * creciente tras un fallo y una sola corrida a la vez. Con el turno bloqueado responde enseguida
 * sin escribir nada (C-21); cuando le toca correr, responde al terminar con el resultado (la ficha
 * del cliente lo usa para refrescar el GPS si entró algo nuevo).
 * Solo usuarios internos (guardInternalUser).
 */
export async function POST() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const result = await autoSyncGoogleMeet();
  return NextResponse.json(result);
}
