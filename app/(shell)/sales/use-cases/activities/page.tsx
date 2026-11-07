/**
 * /sales/use-cases/activities — la biblioteca de actividades con que se arma cada caso del catálogo (borrador para la
 * revisión de Elías). Una línea por actividad, por etapa: su tiempo, quién la hace, cómo se cobra dentro de una venta y
 * en cuántos casos aparece. Son ACCIONES generales del equipo; lo concreto («Configurar la aprobación de cotizaciones»)
 * va en cada caso, y la ficha de la acción lista sus «sobre qué». Abajo, lo que queda por decidir sobre la biblioteca. Al abrir una actividad se ve su ficha: etiquetas y viñetas
 * (`FichaDeLaActividad`). Es interna: el cliente nunca ve actividades ni horas.
 */
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { ETAPAS_DE_ACTIVIDAD, type ActividadDeLaBiblioteca } from "@/lib/casos-de-uso/actividades";
import { bibliotecaDeActividades, casosConCadaActividad, preguntasDeLaBiblioteca } from "@/lib/casos-de-uso/actividades-server";
import { InteriorDeLaActividad, SE_COBRA } from "@/components/casos-de-uso/FichaDeLaActividad";
import { cn } from "@/lib/cn";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export const dynamic = "force-dynamic";

const PLIEGUE = "cursor-pointer list-none [&::-webkit-details-marker]:hidden";

function FilaDeLaBiblioteca({ a, usos }: { a: ActividadDeLaBiblioteca; usos: number }) {
  return (
    <details className="group border-t border-line">
      <summary className={cn(PLIEGUE, "flex flex-col gap-0.5 py-2.5 text-[13px] lg:grid lg:grid-cols-[minmax(0,1fr)_220px_180px_64px] lg:items-baseline lg:gap-x-4")}>
        <span className="flex items-baseline gap-2 text-fg">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true" className="flex-none self-center text-fg-muted transition-transform group-open:rotate-90">
            <path d="m9 6 6 6-6 6" />
          </svg>
          <span className="font-medium">{a.nombre}</span>
          {a.esNueva && <span className="rounded-full border border-line px-1.5 py-px text-[11px] text-fg-muted">nueva</span>}
        </span>
        {/* En el celular, los datos van en una línea debajo del nombre; desde lg, cada uno en su columna. */}
        <span className="flex flex-wrap gap-x-1.5 pl-[19px] text-xs text-fg-muted lg:contents">
          <span className="tabular-nums lg:text-[13px] lg:text-fg-secondary">{a.horasTexto}</span>
          <span aria-hidden="true" className="lg:hidden">·</span>
          <span className="lg:text-[13px] lg:text-fg-secondary">
            {SE_COBRA[a.comparte]}
            {!a.quien.startsWith("CSE") && <span className="text-fg-muted"> · {a.quien}</span>}
          </span>
          <span aria-hidden="true" className="lg:hidden">·</span>
          <span className="tabular-nums lg:text-right">{usos ? `${usos} ${usos === 1 ? "caso" : "casos"}` : "sin casos"}</span>
        </span>
      </summary>
      <div className="pb-3 pl-[19px] pr-2">
        <InteriorDeLaActividad a={a} />
      </div>
    </details>
  );
}

export default async function BibliotecaDeActividadesPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/clients");
  const [ventas, preventa] = await Promise.all([can(ctx.teamMember, "ventas", "read"), can(ctx.teamMember, "preventa", "read")]);
  if (!ventas && !preventa) redirect("/clients");

  const biblioteca = bibliotecaDeActividades();
  const usos = casosConCadaActividad();
  const preguntas = preguntasDeLaBiblioteca();

  return (
    <div className={SHELL_DEFAULT}>
      <div className="mx-auto flex max-w-[980px] flex-col gap-6">
        <PageHeader
          className="mb-0"
          backHref="/sales/use-cases"
          backLabel="Casos de uso"
          title="Biblioteca de actividades"
          description={`Las ${biblioteca.length} actividades con que se arma cada caso. Son acciones generales del equipo: en cada caso la fila dice la concreta («Configurar la aprobación de cotizaciones»). Cada una tiene su tiempo repartido en partes, y quien vende marca o quita las de cada caso. El cliente nunca las ve: ve lo que se entrega.`}
        />

        <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface-muted px-4 py-3 text-[13px] leading-5 text-fg-secondary">
          <span className={ROTULO_DEL_SISTEMA}>Cómo se cobra dentro de una venta</span>
          <span>
            <span className="font-medium text-fg">Una vez en la venta:</span> aunque la traigan varios casos (el Kickoff, por ejemplo).
          </span>
          <span>
            <span className="font-medium text-fg">Una vez si es sobre lo mismo:</span> la actividad dice sobre qué es («Conectar un canal» sobre
            «WhatsApp»). Si dos casos de la misma venta la traen sobre lo mismo, se cobra una vez.
          </span>
          <span>
            <span className="font-medium text-fg">En cada caso:</span> cada caso cobra la suya.
          </span>
        </div>

        {ETAPAS_DE_ACTIVIDAD.map((e) => {
          const filas = biblioteca.filter((a) => a.etapa === e.clave);
          if (!filas.length) return null;
          return (
            <section key={e.clave} className="flex flex-col rounded-xl border border-line bg-surface px-5 py-4">
              <h2 className="pb-2 text-sm font-semibold text-fg">{e.nombre}</h2>
              {filas.map((a: ActividadDeLaBiblioteca) => (
                <FilaDeLaBiblioteca key={a.id} a={a} usos={usos[a.nombre] ?? 0} />
              ))}
            </section>
          );
        })}

        {preguntas.length > 0 && (
          <section className="flex flex-col gap-2 rounded-xl border border-line bg-surface px-5 py-4">
            <details className="group" open>
              <summary className={cn(PLIEGUE, "text-sm font-semibold text-fg")}>Por decidir sobre la biblioteca · {preguntas.length}</summary>
              <ol className="mt-2 flex flex-col gap-3">
                {preguntas.map((p, i) => (
                  <li key={i} className="flex gap-2 text-[13px] leading-5">
                    <span className="flex-none tabular-nums text-fg-muted">{i + 1}.</span>
                    <span className="flex flex-col gap-0.5">
                      <span className="font-medium text-fg">{p.tema}</span>
                      <span className="text-fg-secondary">{p.pregunta}</span>
                      <span className="text-fg-secondary">
                        <span className="font-medium text-brand">Propongo: </span>
                        {p.propuesta}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </details>
          </section>
        )}
      </div>
    </div>
  );
}
