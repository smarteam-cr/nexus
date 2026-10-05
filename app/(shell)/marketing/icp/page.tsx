import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { getConteosAudiencia } from "@/lib/marketing";
import IcpAdminClient from "./IcpAdminClient";

export const dynamic = "force-dynamic";

/** Audiencia › Cliente ideal (ICP). */
export default async function MarketingIcpPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/");
  const [canEdit, conteos] = await Promise.all([can(ctx.teamMember, "marketing", "write"), getConteosAudiencia()]);
  return <IcpAdminClient canEdit={canEdit} conteos={conteos} />;
}
