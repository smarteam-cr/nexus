/**
 * /sales/pipeline — el reporte de los negocios abiertos de Ventas (feedback 9 de Marco Salas, 2026-10-30): monto, cierre,
 * responsable y siguiente paso, y lo que Smarteam prometió a esas empresas. Gateado por `ventas.read`. Solo lee: Nexus no
 * confirma si algo se mandó, mira tareas y reuniones (lib/ventas/pipeline.ts).
 */
import { redirect } from "next/navigation";
import { Alert, PageHeader } from "@/components/ui";
import PipelineDeVentas from "@/components/ventas/PipelineDeVentas";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { vistaDelPipeline } from "@/lib/ventas/pipeline-server";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "ventas", "read"))) redirect("/clients");

  const r = await vistaDelPipeline(ctx.teamMember, new Date());

  return (
    <div className={SHELL_DEFAULT}>
      <PageHeader title="Pipeline" description="Los negocios abiertos de Ventas, con su siguiente paso y lo que Smarteam prometió a cada empresa." />
      {r.estado === "ok" ? (
        <PipelineDeVentas vista={r.vista} />
      ) : (
        <Alert variant="danger">Falta aplicar scripts/sql/2026-10-14-negocios-abiertos.sql.</Alert>
      )}
    </div>
  );
}
