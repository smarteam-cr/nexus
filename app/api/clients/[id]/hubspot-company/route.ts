import { withAuth } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";
import { NextResponse } from "next/server";

/** PUT — guarda el hubspotCompanyId elegido por el usuario */
export const PUT = withAuth(async (
  request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id: clientId } = await params;
  const body = await request.json() as { hubspotCompanyId: string | null };

  const updated = await prisma.client.update({
    where: { id: clientId },
    data: { hubspotCompanyId: body.hubspotCompanyId ?? null },
    select: { id: true, hubspotCompanyId: true },
  });

  return NextResponse.json(updated);
});
