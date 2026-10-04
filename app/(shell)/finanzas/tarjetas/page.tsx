/**
 * /finanzas/tarjetas — las tarjetas de la empresa, con los costos que NO son salarios (rediseño de Finanzas, 2026-10-03).
 *
 * Gate: `gastos.read`. El panel es el mismo de Costos › Tarjetas, contra /api/finanzas/tarjetas: las tarjetas y los costos
 * para asignar se piden con la categoría Salario filtrada en la consulta. Está en la allowlist NO_COSTOS de
 * costos-privacy.test.ts.
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { crDateParts } from "@/lib/jobs/time";
import { loadCostos, loadTarjetas } from "@/lib/cobranza/queries";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import TarjetasPanel from "@/components/finanzas/TarjetasPanel";

export const dynamic = "force-dynamic";

export default async function TarjetasSinSalariosPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "gastos", "read"))) redirect("/clients");
  const todayISO = crDateParts(new Date()).dateKey;
  const [tarjetas, costos] = await Promise.all([
    loadTarjetas(todayISO, { sinSalarios: true }),
    loadCostos({ sinSalarios: true }),
  ]);
  return (
    <div className={SHELL_DEFAULT}>
      <TarjetasPanel initialTarjetas={tarjetas} costos={costos} todayISO={todayISO} apiBase="/api/finanzas/tarjetas" />
    </div>
  );
}
