import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import ContentClient from "./ContentClient";

export const dynamic = "force-dynamic";

export default async function MarketingContenidoPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/");
  return <ContentClient canEdit={await can(ctx.teamMember, "marketing", "write")} />;
}
