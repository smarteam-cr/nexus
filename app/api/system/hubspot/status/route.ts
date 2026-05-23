import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";

export const GET = withAuth(async () => {
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
});
