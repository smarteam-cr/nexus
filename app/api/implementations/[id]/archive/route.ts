import { NextRequest, NextResponse } from "next/server";
import { getConsultantSession } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authenticated = await getConsultantSession();
  if (!authenticated) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { archived } = (await req.json()) as { archived: boolean };

  const updated = await prisma.implementation.update({
    where: { id },
    data: { archived },
  });

  return NextResponse.json(updated);
}
