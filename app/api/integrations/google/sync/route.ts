import { NextResponse } from "next/server";
import { withAuth, apiError } from "@/lib/api";
import { syncGoogleMeetSessions } from "@/lib/google/meet-sync";

export const POST = withAuth(async () => {
  const serviceKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const adminEmail = process.env.GOOGLE_ADMIN_EMAIL;

  if (!serviceKey || !adminEmail) {
    return apiError("google_not_configured", 503);
  }

  const result = await syncGoogleMeetSessions();
  return NextResponse.json(result);
});
