/**
 * /finanzas/costos/planillas/historial — lo que efectivamente se pagó, quincena
 * por quincena. SOLO SUPER_ADMIN.
 * Gate AUTÓNOMO isCostosRole(role) — el redirect corta ANTES de cualquier query.
 * Se replica acá porque una ruta hija NO hereda el gate de su madre: el gate lo
 * pone la page, y el escaneo P4 de costos-privacy.test lo exige archivo por
 * archivo justamente para que nadie asuma esa herencia.
 *
 * ⚠ Es OTRA COSA que su madre `/finanzas/costos/planillas`, que muestra el costo
 * mensual por persona de `CostoRecurrente` y alimenta el burn: una dice cuánto
 * cuesta el mes con la configuración de hoy, ésta cuánto salió de verdad.
 *
 * ⚠ La API sigue en `/api/cobranza/costos/pagos-planilla` a propósito: moverla
 * rompería los imports estáticos de `lib/cobranza/costos-privacy.test.ts` y con
 * eso el escaneo de privacidad entero. El nombre de la ruta de UI es copy; el de
 * la API es identidad.
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
