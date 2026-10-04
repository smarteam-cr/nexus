/**
 * /cobranza — módulo de Admin & Finanzas: panel de cartera, alertas y digest.
 * Gateado por la whitelist client-safe COBRANZA_ROLES (ADMIN + SUPER_ADMIN);
 * el enforcement real vive en guardCobranzaAccess (API) — esto replica el gate
 * en la página (patrón app/business-cases/page.tsx).
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { loadCartera, loadAlertas, loadRiesgo, loadColaCobros } from "@/lib/cobranza";
import { crDateParts } from "@/lib/jobs/time";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import CobranzaClient from "@/components/cobranza/CobranzaClient";

export const dynamic = "force-dynamic";

export default async function CobranzaPage({ searchParams }: { searchParams: Promise<{ pago?: string }> }) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "cobranza", "read"))) redirect("/clients");
  /* ⚠ La API ya exige `cobranza.write` para liberar facturas y deshacer cobros, pero la pantalla
     no lo miraba: quien solo puede ver la cartera igual veía los botones y recién chocaba con
     un 403 al confirmar. Un permiso que solo se manifiesta como error es un permiso que se
     descubre fallando. */
  const puedeEditar = await can(ctx.teamMember, "cobranza", "write");

  const todayISO = crDateParts(new Date()).dateKey; // "hoy" = día calendario CR
  /* Rediseño de Finanzas (2026-10-03): Cobranza es la página de trabajo. Proyección, reportes y corte quincenal se leen
     en Finanzas › Reportes de cobranza; las comisiones de aliado, en su propia página. */
  const [cola, cartera, alertas, riesgo] = await Promise.all([
    loadColaCobros(todayISO),
    loadCartera(todayISO),
    loadAlertas({ estados: ["ABIERTA", "VISTA"] }),
    loadRiesgo(todayISO),
  ]);

  // El PageHeader vive en CobranzaClient: su slot `action` carga el botón global
  // "Registrar pago", que necesita el estado del contenedor.
  return (
    <div className={SHELL_DEFAULT}>
      <CobranzaClient
        initialCola={cola}
        initialCartera={cartera}
        initialAlertas={alertas}
        initialRiesgo={riesgo}
        puedeEditar={puedeEditar}
        /* «Registrar pago» de Pendientes llega con ?pago=1: abre el buscador de una vez. */
        abrirPago={(await searchParams).pago === "1"}
        todayISO={todayISO}
      />
    </div>
  );
}
