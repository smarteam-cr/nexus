/**
 * POST /api/cs/partner/refresh   body opcional: { createClients? }
 *
 * Sync MANUAL del objeto Partner Clients de HubSpot (botón del panel de
 * Customer Success y única vía en dev, donde el cron no corre).
 * Lock en-proceso: un solo sync a la vez (93 records + asociaciones batch —
 * dos en paralelo racean los upserts y duplican presión sobre HubSpot).
 * Si el scope no está autorizado devuelve { supported: false } (la UI muestra
 * "sin permiso de partner"). Gateado con seeAllClients.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCapability } from "@/lib/auth/api-guards";
import { syncPartnerClients } from "@/lib/cs/partner-sync";

let syncInFlight = false;

export async function POST(req: NextRequest) {
  const guard = await guardCapability("seeAllClients");
  if (guard instanceof NextResponse) return guard;
  // CONFIDENCIALIDAD (términos de partner): los datos de uso/UUS/MRR son solo
  // para CSL y SUPER_ADMIN — el sync también (crea Clients y trae esos datos).
  const role = guard.user.teamMember?.roleEnum ?? null;
  if (role !== "CSL" && role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Solo CSL o Super Admin pueden sincronizar partner." }, { status: 403 });
  }

  let body: { createClients?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* sin body = defaults */
  }
  const createClients = body.createClients !== false; // default true (decisión de producto)

  if (syncInFlight) {
    return NextResponse.json({ error: "Ya hay un sync de partner corriendo — esperá a que termine." }, { status: 409 });
  }
  syncInFlight = true;
  try {
    const result = await syncPartnerClients({ createClients });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[cs/partner/refresh] error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "El sync de partner falló." },
      { status: 500 },
    );
  } finally {
    syncInFlight = false;
  }
}
