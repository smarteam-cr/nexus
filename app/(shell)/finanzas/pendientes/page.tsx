/**
 * /finanzas/pendientes — la pantalla de entrada de quien registra (rediseño de Finanzas, 2026-10-03).
 *
 * Lo que le toca hoy, juntado de todo el módulo, cada cosa con el botón que lleva a donde se hace. No muestra lo que la
 * persona ya registró: revisarlo es de quien supervisa (Supervisión). Mismo gate que Cobranza (`cobranza.read`).
 * Todo se lee acá, en el servidor: es una lista para leer y elegir, no una pantalla de trabajo.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { crDateParts } from "@/lib/jobs/time";
import { medirPendientes } from "@/lib/finanzas/pendientes-server";
import { nombreDeQuienSupervisa } from "@/lib/finanzas/vista-server";
import { armarPendientes, type TareaPendiente } from "@/lib/finanzas/pendientes";
import { buttonVariants } from "@/components/ui/button-variants";
import { EmptyState, PageHeader } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export const dynamic = "force-dynamic";

const BOTON_BLANCO =
  "shrink-0 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-fg-secondary hover:bg-surface-hover";

function Bloque({ titulo, tareas }: { titulo: string; tareas: TareaPendiente[] }) {
  if (tareas.length === 0) return null;
  return (
    <section aria-label={titulo} className="rounded-xl border border-line bg-surface">
      <div className="flex items-baseline gap-2.5 px-4 pb-2.5 pt-3.5">
        <h2 className="text-[15px] font-semibold text-fg">{titulo}</h2>
        <span className="text-xs text-fg-muted">{tareas.length === 1 ? "1 cosa" : `${tareas.length} cosas`}</span>
      </div>
      {tareas.map((t) => (
        <div key={t.clave} className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 border-t border-line px-4 py-3">
          <span aria-hidden className="w-4 text-center text-[13px] text-warning">
            ●
          </span>
          <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-0.5">
            <span className="text-sm font-semibold text-fg">{t.titulo}</span>
            <span className="text-[13px] leading-[1.45] text-fg-secondary">{t.detalle}</span>
          </div>
          {t.plata && <span className="shrink-0 text-[13px] tabular-nums text-fg-secondary">{t.plata}</span>}
          <Link href={t.href} className={BOTON_BLANCO}>
            {t.accion}
          </Link>
        </div>
      ))}
    </section>
  );
}

export default async function PendientesPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "cobranza", "read"))) redirect("/clients");
  const todayISO = crDateParts(new Date()).dateKey;
  const [datos, supervisor] = await Promise.all([medirPendientes(todayISO), nombreDeQuienSupervisa()]);
  const tareas = armarPendientes(datos);
  const hoy = tareas.filter((t) => t.cuando === "hoy");
  const semana = tareas.filter((t) => t.cuando === "semana");
  const devueltos = datos.devueltos ?? [];

  return (
    <div className={`${SHELL_DEFAULT} space-y-5`}>
      <PageHeader
        title="Pendientes"
        description="Lo que te toca en finanzas, lo más urgente primero. Cada cosa te lleva a la página donde se hace."
        action={
          <Link href="/cobranza?pago=1" className={buttonVariants({ variant: "primary", size: "lg" })}>
            Registrar pago
          </Link>
        }
      />

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[2_1_560px] flex-col gap-5">
          {tareas.length === 0 && devueltos.length === 0 ? (
            <EmptyState
              title="No tienes nada pendiente en finanzas"
              description="Todo lo que tocaba facturar, registrar y conciliar está al día."
            />
          ) : (
            <>
              <Bloque titulo="Para hoy" tareas={hoy} />
              <Bloque titulo="Esta semana" tareas={semana} />
            </>
          )}

          <section aria-label={`Devuelto por ${supervisor}`} className={devueltos.length ? "rounded-xl border border-warn-line bg-warn-surface" : "rounded-xl border border-dashed border-line bg-surface-muted p-4"}>
            {devueltos.length === 0 ? (
              <div className="space-y-1">
                <h2 className="text-[15px] font-semibold text-fg">Devuelto por {supervisor}</h2>
                <p className="text-[13px] text-fg-muted">
                  Nada devuelto. Si {supervisor} te devuelve algo para corregir, aparece acá con su comentario y el botón
                  para ir a arreglarlo.
                </p>
              </div>
            ) : (
              <>
                <h2 className="px-4 pb-2 pt-3.5 text-[15px] font-semibold text-fg">Devuelto por {supervisor}</h2>
                {devueltos.map((d) => (
                  <div key={d.id} className="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-warn-line px-4 py-3">
                    <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-0.5">
                      <span className="text-sm font-semibold text-fg">{d.texto}</span>
                      <span className="text-[13px] text-warn-ink">
                        {d.por}: «{d.comentario}»
                      </span>
                    </div>
                    <Link href={d.href} className={BOTON_BLANCO}>
                      Corregir
                    </Link>
                  </div>
                ))}
              </>
            )}
          </section>
        </div>

        <aside className="flex min-w-0 flex-[1_1_280px] flex-col gap-4">
          {datos.decisiones > 0 && (
            <section aria-label={`Esperan a ${supervisor}`} className="space-y-2 rounded-xl border border-line bg-surface-muted p-4">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Esperan a {supervisor}</span>
              <p className="text-[13px] leading-[1.45] text-fg-secondary">
                {datos.decisiones === 1 ? "1 diferencia es" : `${datos.decisiones} diferencias son`} preguntas de negocio,
                como «¿entró esta plata?». Las decide {supervisor}: no tienes que hacer nada con ellas.
              </p>
              <Link href="/finanzas/conciliacion" className="text-[13px] font-semibold text-brand hover:text-brand-light">
                Verlas en Conciliación
              </Link>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
