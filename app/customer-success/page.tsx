import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui";
import { requireCapability } from "@/lib/auth/roles";
import { accessibleClientWhere } from "@/lib/auth/access";
import { loadPortfolio } from "@/lib/portfolio/load";
import { loadCsPanel } from "@/lib/cs/load-panel";
import { loadCsDashboard } from "@/lib/cs/load-dashboard";
import CsPanel from "@/components/cs/CsPanel";
import CsDashboard from "@/components/cs/dashboard/CsDashboard";

// Depende del usuario logueado (rol) → no cacheable.
export const dynamic = "force-dynamic";

// CUSTOMER SUCCESS — centro de decisión de la CSL: dashboard visual (carga por
// CSE, etapas, bloqueos, adopción/uso de Partner) + alertas triadas por el
// watchdog + expansión/renovaciones + buckets de salud. Todo dato derivado
// lleva su fuente (SourceChip). Solo seeAllClients (CSL / Ventas / Super Admin);
// un CSE es redirigido a /clients (mismo gate que el dashboard viejo).
export default async function CustomerSuccessPage() {
  const ctx = await requireCapability("seeAllClients").catch(() => null);
  if (!ctx) redirect("/clients");

  const where = await accessibleClientWhere(ctx.user);
  // CONFIDENCIALIDAD (términos de partner de HubSpot): uso/UUS/MRR solo CSL y
  // SUPER_ADMIN — otros roles seeAllClients (Ventas/Marketing/Dev) no los ven.
  const role = ctx.user.teamMember?.roleEnum ?? null;
  const canSeePartnerData = role === "CSL" || role === "SUPER_ADMIN";
  // El portfolio (la query más pesada) se carga UNA vez y se comparte.
  const rows = await loadPortfolio(where);
  const [data, dashboard] = await Promise.all([
    loadCsPanel(where, rows),
    loadCsDashboard(where, rows, canSeePartnerData),
  ]);

  const openAlerts = data.alerts.filter((a) => a.status === "OPEN").length;
  return (
    <AppShell>
      <div className="px-6 py-8">
        <PageHeader
          title="Éxito del cliente"
          description={
            data.rows.length === 0
              ? "Sin proyectos"
              : `${data.rows.length} proyecto${data.rows.length !== 1 ? "s" : ""}${openAlerts > 0 ? ` · ${openAlerts} alerta${openAlerts !== 1 ? "s" : ""} sin ver` : " · sin alertas nuevas"}`
          }
        />
        <CsDashboard data={dashboard} />
        <CsPanel data={data} canSyncPartner={canSeePartnerData} />
      </div>
    </AppShell>
  );
}
