import { NextResponse } from "next/server";
import { withAuth, apiError } from "@/lib/api";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { enrichGoogleMeetSessions } from "@/lib/google/meet-enrichment";
import { prisma } from "@/lib/db/prisma";

export const POST = withAuth(async (req) => {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;

  const serviceKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const adminEmail = process.env.GOOGLE_ADMIN_EMAIL;

  if (!serviceKey || !adminEmail) {
    return apiError("google_not_configured", 503);
  }

  const { searchParams } = new URL(req.url);
  const force = searchParams.get("force");

  if (force === "true") {
    // Reset SOLO las sesiones sin transcript
    await prisma.firefliesSession.updateMany({
      where: { source: "google_meet", enrichedAt: { not: null }, transcript: null },
      data: { enrichedAt: null },
    });
  } else if (force === "all") {
    // Reset absoluto: limpia transcript y summary además de enrichedAt,
    // para que el re-enriquecimiento parta de cero y no quede contenido incorrecto.
    await prisma.firefliesSession.updateMany({
      where: { source: "google_meet", enrichedAt: { not: null } },
      data: { enrichedAt: null, transcript: null, summary: null },
    });
  }

  const result = await enrichGoogleMeetSessions();
  return NextResponse.json(result);
});
