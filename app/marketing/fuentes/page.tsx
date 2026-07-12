import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import SourcesClient from "./SourcesClient";

export const dynamic = "force-dynamic";

export default async function MarketingSourcesPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/");
  return <SourcesClient canEdit={await can(ctx.teamMember, "marketing", "write")} />;
}
