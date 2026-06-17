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
  return NextResponse.json(result);
});
