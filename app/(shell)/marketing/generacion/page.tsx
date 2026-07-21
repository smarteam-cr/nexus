import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { prisma } from "@/lib/db/prisma";
import { MARKETING_GEN_DEFAULTS } from "@/lib/marketing/schema";
import EngineClient from "./EngineClient";

export const dynamic = "force-dynamic";

export default async function MarketingContenidoPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/");
  const [canEdit, settings] = await Promise.all([
    can(ctx.teamMember, "marketing", "write"),
    prisma.marketingSettings.findUnique({
      where: { id: "marketing" },
      select: { genEmpresaTarget: true, genPersonaTarget: true },
    }),
  ]);
  return (
    <EngineClient
      canEdit={canEdit}
      empresaTarget={settings?.genEmpresaTarget ?? MARKETING_GEN_DEFAULTS.empresa}
      personaTarget={settings?.genPersonaTarget ?? MARKETING_GEN_DEFAULTS.persona}
    />
  );
}
