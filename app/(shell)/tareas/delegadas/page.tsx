/**
 * /tareas/delegadas — Lo que delegaste (Elías, 2026-10-09): lo que le pediste o asignaste a otras personas y a otros
 * equipos, y cómo va.
 *
 * Sin gate: es de todo el equipo interno y muestra solo lo que la persona pidió o asignó, con la regla de visibilidad de
 * siempre. Sin el SQL del módulo, un Alert que nombra el archivo.
 */
import { requireInternalUser } from "@/lib/auth/supabase";
import { EmptyState } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { SIN_EL_SQL, siFaltaElSql, TareasSinElSql } from "@/components/tareas/TareasSinElSql";
import { contextoDeTareas, tareasDisponible } from "@/lib/tareas/servidor";
import { clientesQueVesParaTareas } from "@/lib/tareas/clientes";
import { cargarLoQueDelegaste } from "@/lib/tareas/consultas";
import LoQueDelegaste from "@/components/tareas/LoQueDelegaste";

export const dynamic = "force-dynamic";

export default async function LoQueDelegastePage() {
  const r = await requireInternalUser().catch(() => null);
  if (!r) {
    return (
      <div className={SHELL_DEFAULT}>
        <EmptyState title="Tareas es del equipo de Smarteam" description="Tu cuenta no está vinculada a una persona del equipo." />
      </div>
    );
  }
  if (!(await tareasDisponible())) return <TareasSinElSql />;
  const datos = await Promise.all([contextoDeTareas(r.user), clientesQueVesParaTareas(r.teamMember)])
    .then(([ctx, clientes]) => cargarLoQueDelegaste(ctx, clientes))
    .catch(siFaltaElSql);
  if (datos === SIN_EL_SQL) return <TareasSinElSql />;
  return <LoQueDelegaste inicial={datos} />;
}
