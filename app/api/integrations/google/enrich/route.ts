import { NextResponse } from "next/server";
import { withAuth, apiError } from "@/lib/api";
import { enrichGoogleMeetSessions } from "@/lib/google/meet-enrichment";

export const POST = withAuth(async () => {
  const serviceKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const adminEmail = process.env.GOOGLE_ADMIN_EMAIL;

  if (!serviceKey || !adminEmail) {
    return apiError("google_not_configured", 503);
  }

  const result = await enrichGoogleMeetSessions();
  return NextResponse.json(result);
});
