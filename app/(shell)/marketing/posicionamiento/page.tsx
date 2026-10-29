import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { getConteosAudiencia } from "@/lib/marketing";
import PosicionamientoClient from "./PosicionamientoClient";

export const dynamic = "force-dynamic";

/** Audiencia › Position statement (K3, 2026-10-28). */
export default async function MarketingPosicionamientoPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/");
  const [canEdit, conteos] = await Promise.all([can(ctx.teamMember, "marketing", "write"), getConteosAudiencia()]);
  return <PosicionamientoClient canEdit={canEdit} conteos={conteos} />;
}
