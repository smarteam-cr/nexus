import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { syncHandoffToHubspot, retryPendingHandoffs } from "@/lib/hubspot/handoff-sync";

/**
 * POST /api/handoffs/sync
 *
 * Sincroniza handoffs hacia el CRM de Smarteam (crea el record "projects"). Idempotente.
 *  - body { handoffId }  → sincroniza ese handoff.
 *  - body {}             → reintenta todos los pending/failed.
 *
 * Gateado por scope: si el token del sistema no tiene `crm.objects.projects.write`,
 * cada resultado vuelve con status "no_scope" y NO se escribe nada en HubSpot.
 */
export async function POST(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;

  let body: { handoffId?: string } = {};
  try {
    body = (await req.json()) as { handoffId?: string };
  } catch {
    /* body opcional */
  }

  if (body.handoffId) {
    const result = await syncHandoffToHubspot(body.handoffId);
    return NextResponse.json({ results: [result] });
  }

  const results = await retryPendingHandoffs();
  return NextResponse.json({ results });
}
