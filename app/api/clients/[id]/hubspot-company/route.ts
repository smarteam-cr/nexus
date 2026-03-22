import { requireConsultantSession } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";

/** PUT — guarda el hubspotCompanyId elegido por el usuario */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireConsultantSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: clientId } = await params;
  const body = await request.json() as { hubspotCompanyId: string | null };

  const updated = await prisma.client.update({
    where: { id: clientId },
    data: { hubspotCompanyId: body.hubspotCompanyId ?? null },
    select: { id: true, hubspotCompanyId: true },
  });

  return NextResponse.json(updated);
}
