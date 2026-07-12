/**
 * /cobranza — módulo de Admin & Finanzas: panel de cartera, alertas y digest.
 * Gateado por la whitelist client-safe COBRANZA_ROLES (ADMIN + SUPER_ADMIN);
 * el enforcement real vive en guardCobranzaAccess (API) — esto replica el gate
 * en la página (patrón app/business-cases/page.tsx).
 */
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
// El gate del MÓDULO es cobranza.read (permisos); el de COSTOS sigue siendo
// isCostosRole (SUPER_ADMIN-only hard-coded — no editable por la matriz).
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import {
  loadCartera,
  loadAlertas,
  getLatestSnapshot,
  loadProyeccion,
  loadSnapshotSeries,
  loadRiesgo,
  loadColaCobros,
  loadCostos,
  loadCajaNeta,
  loadGastos,
} from "@/lib/cobranza";
import { crDateParts } from "@/lib/jobs/time";
import CobranzaClient from "@/components/cobranza/CobranzaClient";

export const dynamic = "force-dynamic";

export default async function CobranzaPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "cobranza", "read"))) redirect("/clients");

  // PRIVACIDAD (capa 2 de 3): para un no-SUPER_ADMIN las queries de costos NI SE
  // EJECUTAN — las props llegan null y ni un byte de salarios entra al payload RSC.
  const canCostos = isCostosRole(ctx.role);

  const todayISO = crDateParts(new Date()).dateKey; // "hoy" = día calendario CR
  const [cola, cartera, alertas, snapshot, proyeccion, series, riesgo, costos, cajaNeta, gastos] =
    await Promise.all([
      loadColaCobros(todayISO),
      loadCartera(todayISO),
      loadAlertas({ estados: ["ABIERTA", "VISTA"] }),
      getLatestSnapshot(),
      loadProyeccion(todayISO),
      loadSnapshotSeries(),
      loadRiesgo(todayISO),
      canCostos ? loadCostos() : Promise.resolve(null),
      canCostos ? loadCajaNeta(todayISO) : Promise.resolve(null),
      canCostos ? loadGastos() : Promise.resolve(null),
    ]);

  // El PageHeader vive en CobranzaClient: su slot `action` carga el botón global
  // "Registrar pago", que necesita el estado del contenedor.
  return (
    <AppShell>
      <div className="px-6 py-8">
        <CobranzaClient
          initialCola={cola}
          initialCartera={cartera}
          initialAlertas={alertas}
          initialSnapshot={snapshot}
          initialProyeccion={proyeccion}
          initialSeries={series}
          initialRiesgo={riesgo}
          initialCostos={costos}
          initialCajaNeta={cajaNeta}
          initialGastos={gastos}
          role={ctx.role}
          todayISO={todayISO}
        />
      </div>
    </AppShell>
  );
}
