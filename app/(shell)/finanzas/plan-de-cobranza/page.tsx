/**
 * /finanzas/plan-de-cobranza — una página corta para Alex (cobranza) y Marco (dirección): qué hace
 * Nexus ahora en cobranza, qué falta y quién lo hace, y qué espera una decisión.
 *
 * ⚠ Gate `isCostosRole` (SUPER_ADMIN), NO `cobranza.read`. Medido en solo lectura el 2026-09-13:
 * Alex y Marco son SUPER_ADMIN, y el único otro es Elías, así que entran los dos y nadie más.
 * `cobranza.read` abriría la página también a ADMIN y a quien la matriz de /team le dé esa celda, y
 * la página habla del margen y del punto de equilibrio, que viven detrás del candado de costos
 * (/finanzas/equilibrio): el resumen no puede ser una puerta lateral a esas cifras. Además el
 * escaneo de costos-privacy.test.ts exige este gate en toda página de finanzas que no se declare
 * como ingreso.
 * ⚠ Si Alex deja de ser SUPER_ADMIN, la página se le cierra: entonces habría que sacar el renglón
 * del margen y declararla en NO_COSTOS con `cobranza.read`.
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import { loadEstadoDelPlan } from "@/lib/finanzas/plan-de-cobranza-vivo";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import PlanDeCobranzaPanel from "@/components/finanzas/PlanDeCobranzaPanel";

export const dynamic = "force-dynamic";

export default async function PlanDeCobranzaPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !isCostosRole(ctx.role)) redirect("/clients");

  const vivo = await loadEstadoDelPlan();

  return (
    <div className={SHELL_DEFAULT}>
      <PlanDeCobranzaPanel vivo={vivo} />
    </div>
  );
}
