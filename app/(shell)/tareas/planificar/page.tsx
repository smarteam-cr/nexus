/**
 * /tareas/planificar — «Planifica tu semana» (fase 2.3 de docs/nexus-sistema-de-trabajo-plan.md, 2026-10-17).
 *
 * Vive en Tareas y no en «Para ti» porque lo que deja son tareas (la acción de cada cuenta y su reunión planeada) y es
 * el par de «Revisa tu semana»: el viernes se revisa lo hecho y se planifica lo que viene. «Para ti» la ofrece los
 * viernes. Desde el viernes planifica la semana que viene; de lunes a jueves, lo que queda de esta.
 *
 * Sin gate: es de todo el equipo interno y muestra solo las cuentas de quien la abre (las de su inicio:
 * lib/mi-dia/planificar-server.ts), con la regla de visibilidad de Tareas.
 */
import { requireInternalUser } from "@/lib/auth/supabase";
import { EmptyState, PageHeader } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { alcanceDe } from "@/lib/para-ti/alcance-server";
import { varianteDelInicio } from "@/lib/mi-dia/inicio";
import { planDeLaSemana } from "@/lib/mi-dia/planificar-server";
import { semanaAPlanificar } from "@/lib/mi-dia/planificar";
import { crDateParts } from "@/lib/jobs/time";
import PlanificaTuSemana from "@/components/tareas/PlanificaTuSemana";

export const dynamic = "force-dynamic";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const fecha = (ymd: string) => `${Number(ymd.slice(8, 10))} de ${MESES[Number(ymd.slice(5, 7)) - 1]}`;

export default async function PlanificaTuSemanaPage() {
  const r = await requireInternalUser().catch(() => null);
  if (!r) {
    return (
      <div className={SHELL_DEFAULT}>
        <EmptyState title="Tareas es del equipo de Smarteam" description="Tu cuenta no está vinculada a una persona del equipo." />
      </div>
    );
  }
  const alcance = await alcanceDe(r.teamMember);
  const ahora = new Date();
  const hoyISO = crDateParts(ahora).dateKey;
  const variante = varianteDelInicio({ rol: alcance.rol, frentes: alcance.frentes, tieneVentas: false });
  const semana = semanaAPlanificar(hoyISO);
  const datos = await planDeLaSemana(variante, alcance, { ahora, hoyISO }).catch(() => null);

  return (
    <div className={`${SHELL_DEFAULT} space-y-6 pb-12`}>
      <PageHeader
        title="Planifica tu semana"
        description={`${semana.cual === "proxima" ? "La semana que viene" : "Lo que queda de esta semana"}: del ${fecha(semana.dias[0])} al ${fecha(semana.viernes)}. Cada cuenta, su acción con fecha y su reunión.`}
        backHref="/tareas"
        backLabel="Mis tareas"
      />
      {datos ? (
        <PlanificaTuSemana plan={datos.plan} sinEntrar={datos.sinEntrar} correo={alcance.email} />
      ) : (
        <EmptyState title="No se pudo armar la semana" description="Vuelve a intentarlo en un momento." />
      )}
    </div>
  );
}
