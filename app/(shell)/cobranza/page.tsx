/**
 * /cobranza — módulo de Admin & Finanzas: panel de cartera, alertas y digest.
 * Gateado por la whitelist client-safe COBRANZA_ROLES (ADMIN + SUPER_ADMIN);
 * el enforcement real vive en guardCobranzaAccess (API) — esto replica el gate
 * en la página (patrón app/business-cases/page.tsx).
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import {
  loadCartera,
  loadAlertas,
  getLatestSnapshot,
  loadProyeccion,
  loadSnapshotSeries,
  loadRiesgo,
  loadColaCobros,
} from "@/lib/cobranza";
import { crDateParts } from "@/lib/jobs/time";
import CobranzaClient from "@/components/cobranza/CobranzaClient";

export const dynamic = "force-dynamic";

export default async function CobranzaPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "cobranza", "read"))) redirect("/clients");

  const todayISO = crDateParts(new Date()).dateKey; // "hoy" = día calendario CR
  const [cola, cartera, alertas, snapshot, proyeccion, series, riesgo] = await Promise.all([
    loadColaCobros(todayISO),
    loadCartera(todayISO),
    loadAlertas({ estados: ["ABIERTA", "VISTA"] }),
    getLatestSnapshot(),
    loadProyeccion(todayISO),
    loadSnapshotSeries(),
    loadRiesgo(todayISO),
  ]);

  // El PageHeader vive en CobranzaClient: su slot `action` carga el botón global
  // "Registrar pago", que necesita el estado del contenedor.
  return (
    <div className="px-6 py-8">
      <CobranzaClient
        initialCola={cola}
        initialCartera={cartera}
        initialAlertas={alertas}
        initialSnapshot={snapshot}
        initialProyeccion={proyeccion}
        initialSeries={series}
        initialRiesgo={riesgo}
        role={ctx.role}
        todayISO={todayISO}
      />
    </div>
  );
}
