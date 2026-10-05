import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { getResumenInsumos } from "@/lib/marketing";
import { proximaTanda } from "@/lib/marketing/tanda";
import EngineClient from "./EngineClient";

export const dynamic = "force-dynamic";

export default async function MarketingGeneracionPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/");
  const [canEdit, resumen] = await Promise.all([can(ctx.teamMember, "marketing", "write"), getResumenInsumos()]);
  const p = proximaTanda(new Date(), resumen.lastCronDateKey);
  return <EngineClient canEdit={canEdit} proximaTanda={{ etiqueta: p.etiqueta, pendienteHoy: p.pendienteHoy }} resumen={resumen} />;
}
