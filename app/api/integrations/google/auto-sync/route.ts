import { NextResponse } from "next/server";
import { autoSyncGoogleMeet } from "@/lib/google/auto-sync";
import { guardInternalUser } from "@/lib/auth/api-guards";

/**
 * POST /api/integrations/google/auto-sync
 *
 * Endpoint ligero para disparar sync+enrich desde el cliente (fire-and-forget).
 * Tiene cooldown de 20 min en memoria — responde inmediatamente con el resultado.
 * No requiere autenticación (solo usable internamente desde la app).
 */
export async function POST() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const result = await autoSyncGoogleMeet();
  return NextResponse.json(result);
}
