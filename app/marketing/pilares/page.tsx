import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isMarketingEditor } from "@/lib/auth/marketing-roles";
import PillarsClient from "./PillarsClient";

export const dynamic = "force-dynamic";

export default async function MarketingPillarsPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/");
  return <PillarsClient canEdit={isMarketingEditor(ctx.role)} />;
}
