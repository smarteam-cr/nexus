/**
 * /api/marketing/campaigns — ideas de campañas (PPC/paid).
 * GET ?status=PENDING|APPROVED|DISCARDED (cualquier interno).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { getCampaigns } from "@/lib/marketing/queries";

export async function GET(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;

  const raw = req.nextUrl.searchParams.get("status");
  const status =
    raw === "PENDING" || raw === "APPROVED" || raw === "DISCARDED" ? raw : undefined;
  return NextResponse.json({ campaigns: await getCampaigns(status) });
}
