import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isMarketingEditor } from "@/lib/auth/marketing-roles";
import SourcesClient from "./SourcesClient";

export const dynamic = "force-dynamic";

export default async function MarketingSourcesPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/");
  return <SourcesClient canEdit={isMarketingEditor(ctx.role)} />;
}
