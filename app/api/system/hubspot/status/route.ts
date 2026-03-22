import { NextResponse } from "next/server";
import { requireConsultantSession } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  try {
    await requireConsultantSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await prisma.hubspotAccount.findFirst({
    where: { isSystem: true },
    select: {
      id: true,
      hubName: true,
      hubspotPortalId: true,
      expiresAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!account) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    hubName: account.hubName,
    hubspotPortalId: account.hubspotPortalId,
    expiresAt: account.expiresAt,
    updatedAt: account.updatedAt,
  });
}
