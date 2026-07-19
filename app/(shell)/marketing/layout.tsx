/**
 * /marketing — layout del área: header + tabs del grupo activo + contenido.
 * El submenú del sidebar (NavFlyout) solo tiene los 3 grupos; navegar
 * entre las sub-secciones DENTRO del grupo activo (ej. Contenido/Generación/
 * Ideas de campaña/Temas/Fuentes dentro de "Generación de contenido") son
 * estas tabs (MarketingSectionTabs — no se muestran si el grupo no tiene
 * hijos, como "Voz de marca"). LECTURA universal (cualquier rol interno); la
 * EDICIÓN la gatean las páginas (canEdit) y la API (guardMarketingEditor).
 * Por eso acá solo se exige login.
 */
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requireInternalUser } from "@/lib/auth/supabase";
import MarketingSectionTabs from "./MarketingSectionTabs";

export const dynamic = "force-dynamic";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/");

  return (
    <div className="px-6 py-8">
      <PageHeader
        title="Marketing"
        description="Ideas listas para revisar, la generación de contenido, y los insumos del equipo (audiencia y voz de marca)"
      />
      <div className="mt-6">
        <MarketingSectionTabs />
        {children}
      </div>
    </div>
  );
}
