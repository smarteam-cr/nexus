/**
 * /finanzas/costos/tarjetas — las tarjetas de crédito de la empresa y su
 * capacidad disponible, SOLO SUPER_ADMIN.
 * Gate AUTÓNOMO isCostosRole(role) — el redirect corta ANTES de cualquier query,
 * así ni un byte de costos entra al payload RSC de un no-SUPER_ADMIN.
 *
 * Trae también los costos recurrentes: son lo que se asigna a cada tarjeta para
 * calcular el cargo mensual de REFERENCIA (nunca el saldo, ver lib/cobranza/tarjetas.ts).
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import { loadTarjetas, loadCostos } from "@/lib/cobranza";
import { crDateParts } from "@/lib/jobs/time";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import TarjetasPanel from "@/components/finanzas/TarjetasPanel";

export const dynamic = "force-dynamic";

export default async function FinanzasTarjetasPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !isCostosRole(ctx.role)) redirect("/clients");

  const todayISO = crDateParts(new Date()).dateKey;
  const [tarjetas, costos] = await Promise.all([loadTarjetas(todayISO), loadCostos()]);

  return (
    <div className={SHELL_DEFAULT}>
      <TarjetasPanel initialTarjetas={tarjetas} costos={costos} todayISO={todayISO} />
    </div>
  );
}
