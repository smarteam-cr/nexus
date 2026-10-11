/**
 * /tareas/por-cliente — «Tareas internas por cliente» (docs/tareas-plan.md §4.3).
 *
 * Las tareas internas del equipo agrupadas por para quién son, solo sobre lo que ves: lo abierto hoy y lo hecho en el
 * período (Esta semana · Este mes · Trimestre). No es el cronograma que ve el cliente. Sin el SQL, avisa qué falta.
 */
import { requireInternalUser } from "@/lib/auth/supabase";
import { EmptyState } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { SIN_EL_SQL, siFaltaElSql, TareasSinElSql } from "@/components/tareas/TareasSinElSql";
import { contextoDeTareas, tareasDisponible } from "@/lib/tareas/servidor";
import { clientesQueVesParaTareas } from "@/lib/tareas/clientes";
import { cargarPorCliente } from "@/lib/tareas/consultas";
import type { PeriodoPorCliente } from "@/lib/tareas/tipos";
import PorCliente from "@/components/tareas/PorCliente";

export const dynamic = "force-dynamic";

const PERIODOS: readonly PeriodoPorCliente[] = ["semana", "mes", "trimestre"];

export default async function PorClientePage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
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
  const periodo = PERIODOS.find((p) => p === sp.periodo) ?? "mes";
  const datos = await Promise.all([contextoDeTareas(r.user), clientesQueVesParaTareas(r.teamMember)])
    .then(([ctx, clientes]) => cargarPorCliente(ctx, clientes, periodo))
    .catch(siFaltaElSql);
  if (datos === SIN_EL_SQL) return <TareasSinElSql />;
  return <PorCliente key={periodo} datos={datos} />;
}
