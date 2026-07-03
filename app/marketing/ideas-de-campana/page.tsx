import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isMarketingEditor } from "@/lib/auth/marketing-roles";
import CampaignsClient from "./CampaignsClient";

export const dynamic = "force-dynamic";

export default async function MarketingCampaignsPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/");
  return <CampaignsClient canEdit={isMarketingEditor(ctx.role)} />;
}
