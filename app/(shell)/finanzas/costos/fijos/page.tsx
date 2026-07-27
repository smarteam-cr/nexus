/**
 * /finanzas/costos/fijos — hoja de la categoría FIJO_OPERACION, SOLO SUPER_ADMIN.
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

export default async function FinanzasCostosFijosPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !isCostosRole(ctx.role)) redirect("/clients");

  const todayISO = crDateParts(new Date()).dateKey;
  const costos = await loadCostos();

  return (
    <div className={SHELL_DEFAULT}>
      <FinanzasCostosCategoriaClient
        categoria="FIJO_OPERACION"
        titulo="Costos fijos"
        descripcion="Fijos de operación: alquiler, cargas, seguros — estimados de referencia."
        leyenda="Lo que se paga todos los meses para que la operación exista."
        initialCostos={costos.filter((c) => c.categoria === "FIJO_OPERACION")}
        todayISO={todayISO}
      />
    </div>
  );
}
