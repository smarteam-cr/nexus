import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import VoiceClient from "./VoiceClient";

export const dynamic = "force-dynamic";

export default async function MarketingVoicePage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/");
  return <VoiceClient canEdit={await can(ctx.teamMember, "marketing", "write")} />;
}
