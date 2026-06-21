import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui";
import { requireCapability } from "@/lib/auth/roles";
import { accessibleClientWhere } from "@/lib/auth/access";
import { loadPortfolio } from "@/lib/portfolio/load";
import PortfolioGrid from "@/components/dashboard/PortfolioGrid";

// Depende del usuario logueado (rol) → no cacheable.
export const dynamic = "force-dynamic";

// D.3 panel de cartera — vista de mando sobre TODOS los proyectos para liderazgo de CS
// (seeAllClients: CSL / Ventas / Super Admin). Un CSE no tiene la capacidad → redirect.
export default async function DashboardPage() {
  const ctx = await requireCapability("seeAllClients").catch(() => null);
  if (!ctx) redirect("/clients");

  // Para roles see-all → null (toda la cartera). Mismo where-builder que /clients.
  const where = await accessibleClientWhere(ctx.user);
  const rows = await loadPortfolio(where);

  return (
    <AppShell>
      <div className="px-6 py-8">
        <PageHeader
          title="Gestión de cartera"
          description={
            rows.length === 0
              ? "Sin proyectos"
              : `${rows.length} proyecto${rows.length !== 1 ? "s" : ""} · avance, riesgo y control de alcance`
          }
        />
        <PortfolioGrid rows={rows} />
      </div>
    </AppShell>
  );
}
