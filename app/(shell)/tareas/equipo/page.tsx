/**
 * /tareas/equipo — la Semana del equipo (docs/tareas-plan.md §9.2, básica en 1A.1).
 *
 * Ves la de tu equipo y las de los equipos que lideras; el Super Admin, todas. Pedir otra responde con un aviso, no con
 * un 404: el equipo existe, pero su semana no es tuya. Sin el SQL del módulo, un Alert que nombra el archivo.
 */
import { requireInternalUser } from "@/lib/auth/supabase";
import { Alert, EmptyState } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { SIN_EL_SQL, siFaltaElSql, TareasSinElSql } from "@/components/tareas/TareasSinElSql";
import { ErrorDeTareas, contextoDeTareas, tareasDisponible } from "@/lib/tareas/servidor";
import { clientesQueVesParaTareas } from "@/lib/tareas/clientes";
import { cargarSemanaDelEquipo } from "@/lib/tareas/consultas";
import SemanaDelEquipo from "@/components/tareas/SemanaDelEquipo";

export const dynamic = "force-dynamic";

export default async function SemanaDelEquipoPage({ searchParams }: { searchParams: Promise<{ equipo?: string; semana?: string }> }) {
  const r = await requireInternalUser().catch(() => null);
  if (!r) {
    return (
      <div className={SHELL_DEFAULT}>
        <EmptyState title="Tareas es del equipo de Smarteam" description="Tu cuenta no está vinculada a una persona del equipo." />
      </div>
    );
  }
  if (!(await tareasDisponible())) return <TareasSinElSql />;
  const sp = await searchParams;
  const semana = sp.semana && /^\d{4}-\d{2}-\d{2}$/.test(sp.semana) ? sp.semana : null;
  const datos = await Promise.all([contextoDeTareas(r.user), clientesQueVesParaTareas(r.teamMember)])
    .then(([ctx, clientes]) => cargarSemanaDelEquipo(ctx, clientes, sp.equipo ?? null, semana))
    .catch((e: unknown) => {
      if (e instanceof ErrorDeTareas) return e;
      return siFaltaElSql(e);
    });
  if (datos === SIN_EL_SQL) return <TareasSinElSql />;
  if (datos instanceof ErrorDeTareas) {
    return (
      <div className={SHELL_DEFAULT}>
        <Alert variant="warning" title="No puedes ver esa semana">
          {datos.message} Vuelve a la de tu equipo desde el menú.
        </Alert>
      </div>
    );
  }
  return <SemanaDelEquipo key={`${datos.equipo}:${datos.semana}`} inicial={datos} />;
}
