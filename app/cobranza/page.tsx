/**
 * /cobranza — módulo de Admin & Finanzas: panel de cartera, alertas y digest.
 * Gateado por la whitelist client-safe COBRANZA_ROLES (ADMIN + SUPER_ADMIN);
 * el enforcement real vive en guardCobranzaAccess (API) — esto replica el gate
 * en la página (patrón app/business-cases/page.tsx).
 */
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isCobranzaRole } from "@/lib/auth/cobranza-roles";
import { loadCartera, loadAlertas, getLatestSnapshot, loadProyeccion } from "@/lib/cobranza";
import { crDateParts } from "@/lib/jobs/time";
import CobranzaClient from "@/components/cobranza/CobranzaClient";

export const dynamic = "force-dynamic";

export default async function CobranzaPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !isCobranzaRole(ctx.role)) redirect("/clients");

  const todayISO = crDateParts(new Date()).dateKey; // "hoy" = día calendario CR
  const [cartera, alertas, snapshot, proyeccion] = await Promise.all([
    loadCartera(todayISO),
    loadAlertas({ estados: ["ABIERTA", "VISTA"] }),
    getLatestSnapshot(),
    loadProyeccion(todayISO),
  ]);

  return (
    <AppShell>
      <div className="px-6 py-8">
        <PageHeader
          title="Cobranza"
          description="Controlá a quién le toca cobrar y cómo va: cartera, alertas y el corte semanal."
        />
        <CobranzaClient
          initialCartera={cartera}
          initialAlertas={alertas}
          initialSnapshot={snapshot}
          initialProyeccion={proyeccion}
          todayISO={todayISO}
        />
      </div>
    </AppShell>
  );
}
