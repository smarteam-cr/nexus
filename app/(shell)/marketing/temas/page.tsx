import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import TemasClient from "./TemasClient";

export const dynamic = "force-dynamic";

export default async function MarketingTemasPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/");
  return <TemasClient canEdit={await can(ctx.teamMember, "marketing", "write")} />;
}
