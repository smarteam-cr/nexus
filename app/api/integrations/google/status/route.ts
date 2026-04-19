import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";

export const GET = withAuth(async () => {
  const serviceKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const adminEmail = process.env.GOOGLE_ADMIN_EMAIL;

  const connected = !!(serviceKey && serviceKey.trim() && adminEmail && adminEmail.trim());

  return NextResponse.json({
    connected,
    adminEmail: connected ? adminEmail : null,
  });
});
