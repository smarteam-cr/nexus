/**
 * /tareas/espacios/[id] — un espacio y sus proyectos (docs/tareas-plan.md §5.3). A quien no lo ve le responde 404.
 * Sin el SQL del módulo, avisa qué falta.
 */
import { notFound } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { EmptyState } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { SIN_EL_SQL, siFaltaElSql, TareasSinElSql } from "@/components/tareas/TareasSinElSql";
import { ErrorDeTareas, contextoDeTareas, tareasDisponible } from "@/lib/tareas/servidor";
import { clientesQueVesParaTareas } from "@/lib/tareas/clientes";
import { cargarEspacio } from "@/lib/tareas/consultas";
import PaginaDelEspacio from "@/components/tareas/PaginaDelEspacio";

export const dynamic = "force-dynamic";

export default async function EspacioDeTareasPage({ params }: { params: Promise<{ id: string }> }) {
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
    .then(([ctx, clientes]) => cargarEspacio(ctx, clientes, id).then((d) => ({ d, yo: ctx.email })))
    .catch((e: unknown) => {
      if (e instanceof ErrorDeTareas) return null;
      return siFaltaElSql(e);
    });
  if (datos === SIN_EL_SQL) return <TareasSinElSql />;
  if (!datos) notFound();
  return <PaginaDelEspacio key={datos.d.espacio.id} inicial={datos.d} yo={datos.yo} />;
}
