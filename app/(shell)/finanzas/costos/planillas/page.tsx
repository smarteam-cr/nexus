/**
 * /finanzas/costos/planillas — hoja de la categoría SALARIO, SOLO SUPER_ADMIN.
 * Gate AUTÓNOMO isCostosRole(role) — el redirect corta ANTES de cualquier query,
 * así ni un byte de costos entra al payload RSC de un no-SUPER_ADMIN. El filtro
 * por categoría se hace acá para no mandar salarios a una hoja de herramientas.
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import { loadCostos } from "@/lib/cobranza";
import { crDateParts } from "@/lib/jobs/time";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import FinanzasCostosCategoriaClient from "@/components/finanzas/FinanzasCostosCategoriaClient";

export const dynamic = "force-dynamic";

export default async function FinanzasCostosPlanillasPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !isCostosRole(ctx.role)) redirect("/clients");

  const todayISO = crDateParts(new Date()).dateKey;
  const costos = await loadCostos();

  return (
    <div className={SHELL_DEFAULT}>
      <FinanzasCostosCategoriaClient
        categoria="SALARIO"
        titulo="Planillas"
        descripcion="Salarios all-in ESTIMADOS para el burn — esto no es la planilla ni contabilidad."
        leyenda="Costo all-in estimado por persona. El canónico es el monto, no la base por el factor."
        initialCostos={costos.filter((c) => c.categoria === "SALARIO")}
        todayISO={todayISO}
      />
    </div>
  );
}
