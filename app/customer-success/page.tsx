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
import AlertsFeed from "@/components/cs/AlertsFeed";

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
        {/* Las alertas del watchdog (incluidas las derivadas de datos de partner:
            UUS, licencias, renovaciones) son visibles a TODO rol seeAllClients a
            propósito: son insight DERIVADO ("llamá a X porque su uso cae"), no el
            dashboard crudo de uso/MRR, que sí queda gateado por canSeePartnerData.
            Decisión consciente de producto — no es un gate olvidado. El feed va
            ARRIBA de los charts vía slot: es el único ranking accionable por riesgo. */}
        <CsDashboard
          data={dashboard}
          alertsSlot={
            <section>
              <div className="flex items-baseline gap-2 mb-2">
                <h2 className="text-sm font-semibold text-fg">🚨 Alertas</h2>
                <span className="text-[11px] text-fg-muted">triadas por el watchdog — severidad, razón y acción sugerida</span>
              </div>
              <AlertsFeed initialAlerts={data.alerts} />
            </section>
          }
        />
        <CsPanel data={data} canSyncPartner={canSeePartnerData} />
      </div>
    </AppShell>
  );
}
