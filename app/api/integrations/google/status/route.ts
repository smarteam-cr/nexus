import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { guardInternalUser } from "@/lib/auth/api-guards";

export const GET = withAuth(async () => {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;

  const serviceKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const adminEmail = process.env.GOOGLE_ADMIN_EMAIL;

  const connected = !!(serviceKey && serviceKey.trim() && adminEmail && adminEmail.trim());

  return NextResponse.json({
    connected,
    adminEmail: connected ? adminEmail : null,
  });
});
