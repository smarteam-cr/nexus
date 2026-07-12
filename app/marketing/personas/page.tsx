import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import PersonasClient from "./PersonasClient";

export const dynamic = "force-dynamic";

export default async function MarketingPersonasPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/");
  return <PersonasClient canEdit={await can(ctx.teamMember, "marketing", "write")} />;
}
