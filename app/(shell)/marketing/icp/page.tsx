import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import IcpAdminClient from "./IcpAdminClient";

export const dynamic = "force-dynamic";

export default async function MarketingIcpPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/");
  return <IcpAdminClient canEdit={await can(ctx.teamMember, "marketing", "write")} />;
}
