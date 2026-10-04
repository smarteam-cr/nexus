/**
 * /finanzas/recurrentes — los costos de todos los meses que NO son salarios (rediseño de Finanzas, 2026-10-03).
 *
 * Gate: `gastos.read`. ⛔ La lista se pide con la categoría filtrada en la consulta (`loadCostos({ sinSalarios })`): un
 * salario no llega a esta página ni en el payload. Está en la allowlist NO_COSTOS de costos-privacy.test.ts.
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { crDateParts } from "@/lib/jobs/time";
import { loadCostos } from "@/lib/cobranza/queries";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import RecurrentesClient from "@/components/finanzas/RecurrentesClient";

export const dynamic = "force-dynamic";

export default async function RecurrentesPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "gastos", "read"))) redirect("/clients");
  const [costos, puedeEditar] = await Promise.all([loadCostos({ sinSalarios: true }), can(ctx.teamMember, "gastos", "write")]);
  return (
    <div className={SHELL_DEFAULT}>
      <RecurrentesClient
        inicial={costos}
        todayISO={crDateParts(new Date()).dateKey}
        puedeEditar={puedeEditar}
        esSuperAdmin={ctx.role === "SUPER_ADMIN"}
      />
    </div>
  );
}
