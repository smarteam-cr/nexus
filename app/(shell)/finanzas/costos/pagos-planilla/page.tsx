/**
 * /finanzas/costos/pagos-planilla — el LIBRO: lo que efectivamente se pagó,
 * quincena por quincena. SOLO SUPER_ADMIN.
 * Gate AUTÓNOMO isCostosRole(role) — el redirect corta ANTES de cualquier query.
 *
 * ⚠ Es OTRA COSA que la hoja «Planillas» (/finanzas/costos/planillas), que
 * muestra el salario all-in ESTIMADO de CostoRecurrente para el burn: una dice
 * cuánto se calcula que cuesta el mes, ésta cuánto salió de verdad.
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import { loadLibroPlanilla } from "@/lib/cobranza";
import { crDateParts } from "@/lib/jobs/time";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import LibroPlanillaPanel from "@/components/finanzas/LibroPlanillaPanel";

export const dynamic = "force-dynamic";

export default async function FinanzasLibroPlanillaPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !isCostosRole(ctx.role)) redirect("/clients");

  const todayISO = crDateParts(new Date()).dateKey;
  const libro = await loadLibroPlanilla();

  return (
    <div className={SHELL_DEFAULT}>
      <LibroPlanillaPanel initialLibro={libro} todayISO={todayISO} />
    </div>
  );
}
