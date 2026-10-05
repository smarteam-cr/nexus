import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { getConteosAudiencia } from "@/lib/marketing";
import PersonasClient from "./PersonasClient";

export const dynamic = "force-dynamic";

/** Audiencia › Buyer personas. */
export default async function MarketingPersonasPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/");
  const [canEdit, conteos] = await Promise.all([can(ctx.teamMember, "marketing", "write"), getConteosAudiencia()]);
  return <PersonasClient canEdit={canEdit} conteos={conteos} />;
}
