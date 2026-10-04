/**
 * /finanzas/reportes — Reportes de cobranza (rediseño 2026-10-03, docs/finanzas-rediseno-plan.md): Proyección, Reportes y
 * Corte quincenal, que antes eran pestañas de Cobranza. Mismo gate que eran: `cobranza.read`. En el menú solo lo tiene
 * quien supervisa; el reporte ejecutivo, adentro, sigue siendo de Super Admin.
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { getLatestSnapshot, loadColaCobros, loadProyeccion, loadRiesgo, loadSnapshotSeries } from "@/lib/cobranza";
import { crDateParts } from "@/lib/jobs/time";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import ReportesCobranzaClient from "@/components/finanzas/ReportesCobranzaClient";

export const dynamic = "force-dynamic";

export default async function ReportesCobranzaPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "cobranza", "read"))) redirect("/clients");
  const todayISO = crDateParts(new Date()).dateKey;
  const [cola, proyeccion, series, riesgo, snapshot] = await Promise.all([
    loadColaCobros(todayISO),
    loadProyeccion(todayISO),
    loadSnapshotSeries(),
    loadRiesgo(todayISO),
    getLatestSnapshot(),
  ]);
  return (
    <div className={SHELL_DEFAULT}>
      <ReportesCobranzaClient
        initialProyeccion={proyeccion}
        initialSeries={series}
        initialRiesgo={riesgo}
        initialSnapshot={snapshot}
        cola={cola}
        role={ctx.role}
        todayISO={todayISO}
      />
    </div>
  );
}
