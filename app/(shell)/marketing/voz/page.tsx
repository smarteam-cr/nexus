import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { getResumenInsumos } from "@/lib/marketing";
import VoiceClient from "./VoiceClient";

export const dynamic = "force-dynamic";

export default async function MarketingVoicePage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/");
  const [canEdit, resumen] = await Promise.all([can(ctx.teamMember, "marketing", "write"), getResumenInsumos()]);
  return <VoiceClient canEdit={canEdit} resumen={resumen} />;
}
