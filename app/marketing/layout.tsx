/**
 * /marketing — layout del área: header + tabs de subsecciones.
 * LECTURA universal (cualquier rol interno); la EDICIÓN la gatean las páginas
 * (canEdit) y la API (guardMarketingEditor). Por eso acá solo se exige login.
 */
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui";
import { requireInternalUser } from "@/lib/auth/supabase";
import MarketingTabs from "./MarketingTabs";

export const dynamic = "force-dynamic";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/");

  return (
    <AppShell>
      <div className="px-6 py-8">
        <PageHeader
          title="Marketing"
          description="Ideas listas para revisar, el motor que las genera, y los insumos del equipo (ICP, personas, pilares, fuentes, voz)"
        />
        <MarketingTabs />
        <div className="mt-6">{children}</div>
      </div>
    </AppShell>
  );
}
