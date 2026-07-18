import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import CampaignsClient from "./CampaignsClient";

export const dynamic = "force-dynamic";

export default async function MarketingCampaignsPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/");
  return <CampaignsClient canEdit={await can(ctx.teamMember, "marketing", "write")} />;
}
