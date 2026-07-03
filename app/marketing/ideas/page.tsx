import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isMarketingEditor } from "@/lib/auth/marketing-roles";
import IdeasClient from "./IdeasClient";

export const dynamic = "force-dynamic";

export default async function MarketingIdeasPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/");
  return <IdeasClient canEdit={isMarketingEditor(ctx.role)} />;
}
