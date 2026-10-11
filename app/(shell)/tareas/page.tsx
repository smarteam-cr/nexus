/**
 * /tareas — Mis tareas (docs/tareas-plan.md §9.2).
 *
 * Sin gate: es de todo el equipo interno (lo propio no lleva celda), y no muestra nada que la persona no pueda ver. Sin
 * el SQL del módulo, un Alert que nombra el archivo.
 */
import { requireInternalUser } from "@/lib/auth/supabase";
import { EmptyState } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { SIN_EL_SQL, siFaltaElSql, TareasSinElSql } from "@/components/tareas/TareasSinElSql";
import { contextoDeTareas, tareasDisponible } from "@/lib/tareas/servidor";
import { clientesQueVesParaTareas } from "@/lib/tareas/clientes";
import { cargarMisTareas } from "@/lib/tareas/consultas";
import MisTareas from "@/components/tareas/MisTareas";

export const dynamic = "force-dynamic";

export default async function TareasPage() {
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
    .then(([ctx, clientes]) => cargarMisTareas(ctx, clientes))
    .catch(siFaltaElSql);
  if (datos === SIN_EL_SQL) return <TareasSinElSql />;
  return <MisTareas inicial={datos} />;
}
