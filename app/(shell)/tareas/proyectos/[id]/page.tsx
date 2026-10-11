/**
 * /tareas/proyectos/[id] — un proyecto de tareas en su página (docs/tareas-plan.md §5.3 y §9.2): lista o tablero (por
 * estado o por sección), su borrador si lo sugirió una reunión, y el pendiente del proyecto. A quien no lo ve le
 * responde 404. Sin el SQL del módulo, avisa qué falta.
 */
import { notFound } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { EmptyState } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { SIN_EL_SQL, siFaltaElSql, TareasSinElSql } from "@/components/tareas/TareasSinElSql";
import { ErrorDeTareas, contextoDeTareas, tareasDisponible } from "@/lib/tareas/servidor";
import { clientesQueVesParaTareas } from "@/lib/tareas/clientes";
import { cargarProyecto } from "@/lib/tareas/consultas";
import PaginaDelProyecto from "@/components/tareas/PaginaDelProyecto";

export const dynamic = "force-dynamic";

export default async function ProyectoDeTareasPage({ params }: { params: Promise<{ id: string }> }) {
  const r = await requireInternalUser().catch(() => null);
  if (!r) {
    return (
      <div className={SHELL_DEFAULT}>
        <EmptyState title="Tareas es del equipo de Smarteam" description="Tu cuenta no está vinculada a una persona del equipo." />
      </div>
    );
  }
  if (!(await tareasDisponible())) return <TareasSinElSql />;
  const { id } = await params;
  const datos = await Promise.all([contextoDeTareas(r.user), clientesQueVesParaTareas(r.teamMember)])
    .then(([ctx, clientes]) => cargarProyecto(ctx, clientes, id))
    .catch((e: unknown) => {
      if (e instanceof ErrorDeTareas) return null;
      return siFaltaElSql(e);
    });
  if (datos === SIN_EL_SQL) return <TareasSinElSql />;
  if (!datos) notFound();
  return <PaginaDelProyecto key={datos.proyecto.id} inicial={datos} />;
}
