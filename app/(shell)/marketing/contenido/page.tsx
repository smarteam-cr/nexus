import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { getSettings } from "@/lib/marketing";
import { proximaTanda } from "@/lib/marketing/tanda";
import ContentClient from "./ContentClient";

export const dynamic = "force-dynamic";

/** Publicaciones — la entrada de Marketing (la ruta conserva su nombre viejo: hay enlaces pegados). */
export default async function MarketingPublicacionesPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/");
  const [canEdit, settings] = await Promise.all([can(ctx.teamMember, "marketing", "write"), getSettings()]);
  return (
    <ContentClient canEdit={canEdit} proximaTanda={proximaTanda(new Date(), settings?.lastCronDateKey ?? null).etiqueta} />
  );
}
