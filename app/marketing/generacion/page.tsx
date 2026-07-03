import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isMarketingEditor } from "@/lib/auth/marketing-roles";
import EngineClient from "./EngineClient";

export const dynamic = "force-dynamic";

export default async function MarketingContenidoPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/");
  return <EngineClient canEdit={isMarketingEditor(ctx.role)} />;
}
