/**
 * POST /api/cs/signals/refresh   body opcional: { clientId?, force? }
 *
 * Refresca el snapshot de señales HubSpot (ClientCsSignals) — botón "Actualizar
 * señales" del panel de Éxito del cliente. Sin clientId refresca TODOS los
 * clientes con company de HubSpot (secuencial, respeta frescura salvo force).
 * Lock en-proceso: un solo refresh GLOBAL a la vez (recorre todos los clientes
 * con pausas contra rate limits de HubSpot — dos en paralelo duplican la presión
 * y racean los upserts). El refresh de UN cliente no necesita lock.
 * Gateado con seeAllClients (CSL/Ventas/Dev/Marketing/Super Admin).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCapability } from "@/lib/auth/api-guards";
import { computeClientSignals, refreshAllCsSignals } from "@/lib/hubspot/cs-signals";

let globalRefreshInFlight = false;

export async function POST(req: NextRequest) {
  const guard = await guardCapability("seeAllClients");
  if (guard instanceof NextResponse) return guard;

  let body: { clientId?: unknown; force?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* sin body = refresh global */
  }
  const clientId = typeof body.clientId === "string" ? body.clientId : null;
  const force = body.force === true;

  try {
    if (clientId) {
      const summary = await computeClientSignals(clientId);
      return NextResponse.json({ refreshed: [summary], skippedFresh: 0, failed: [] });
    }
    if (globalRefreshInFlight) {
      return NextResponse.json(
        { error: "Ya hay un refresh de señales corriendo — esperá a que termine." },
        { status: 409 },
      );
    }
    globalRefreshInFlight = true;
    try {
      const result = await refreshAllCsSignals({ force });
      return NextResponse.json({
        refreshed: result.refreshed,
        skippedFresh: result.skippedFresh,
        failed: result.failed,
      });
    } finally {
      globalRefreshInFlight = false;
    }
  } catch (e) {
    console.error("[cs/signals/refresh] error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudieron actualizar las señales." },
      { status: 500 },
    );
  }
}
