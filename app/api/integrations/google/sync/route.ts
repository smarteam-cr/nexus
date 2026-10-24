import { NextResponse } from "next/server";
import { withAuth, apiError } from "@/lib/api";
import { guardCapability } from "@/lib/auth/api-guards";
import { syncGoogleMeetSessions } from "@/lib/google/meet-sync";

export const POST = withAuth(async () => {
  // Sync manual completo (impersona vía DWD) → roles con visibilidad total.
  const guard = await guardCapability("seeAllClients");
  if (guard instanceof NextResponse) return guard;

  const serviceKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const adminEmail = process.env.GOOGLE_ADMIN_EMAIL;

  if (!serviceKey || !adminEmail) {
    return apiError("google_not_configured", 503);
  }

  const result = await syncGoogleMeetSessions();
  // U1: con Google sin responder no es «0 nuevas»: es un error (la tarjeta lo muestra), y el texto crudo de Google
  // (puede nombrar la cuenta o la llave) queda en el log del servidor.
  if (result.error) {
    console.log(`[google/sync] el botón Sincronizar falló: ${result.error}`);
    return apiError("google_no_respondio", 502);
  }
  return NextResponse.json(result);
});
