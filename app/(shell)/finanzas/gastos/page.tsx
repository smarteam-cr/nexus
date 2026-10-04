/**
 * /finanzas/gastos — los gastos del mes, sin salarios (rediseño de Finanzas, 2026-10-03, docs/finanzas-rediseno-plan.md).
 *
 * Gate: `gastos.read` (ADMIN lo trae; Super Admin, todo). ⛔ No es una hoja de costos con salarios: de la planilla solo
 * se ve el total del mes (lib/finanzas/gastos-server.ts). Por eso está en la allowlist NO_COSTOS de costos-privacy.test.ts.
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { crDateParts } from "@/lib/jobs/time";
import { loadGastosDelMes } from "@/lib/finanzas/gastos-server";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import GastosDelMesClient from "@/components/finanzas/GastosDelMesClient";

export const dynamic = "force-dynamic";

export default async function GastosDelMesPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "gastos", "read"))) redirect("/clients");
  const todayISO = crDateParts(new Date()).dateKey;
  const { mes } = await searchParams;
  const periodo = mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : todayISO.slice(0, 7);
  const [inicial, puedeEditar] = await Promise.all([loadGastosDelMes(periodo), can(ctx.teamMember, "gastos", "write")]);
  return (
    <div className={SHELL_DEFAULT}>
      <GastosDelMesClient inicial={inicial} todayISO={todayISO} puedeEditar={puedeEditar} esSuperAdmin={ctx.role === "SUPER_ADMIN"} />
    </div>
  );
}
