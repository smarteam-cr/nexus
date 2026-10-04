/**
 * /finanzas/supervision â€” la pantalla de entrada de quien supervisa (rediseÃ±o de Finanzas, 2026-10-03, etapa Â«RevisiÃ³nÂ»).
 *
 * Lo que espera su decisiÃ³n (las preguntas de negocio de ConciliaciÃ³n), el trabajo del equipo por revisar (pagos y
 * gastos, con Â«EstÃ¡ bienÂ» y Â«DevolverÂ») y la cobranza que se complica. Solo direcciÃ³n (Super Admin): el gate es el
 * mismo que Costos, y las rutas que escribe lo vuelven a pedir (`guardSupervisionFinanzas`).
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import { crDateParts } from "@/lib/jobs/time";
import { textoDeMontos } from "@/lib/cobranza/odoo/diferencias";
import { medirSupervision } from "@/lib/finanzas/supervision-server";
import { PageHeader } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import RevisionDelEquipo from "@/components/finanzas/RevisionDelEquipo";

export const dynamic = "force-dynamic";

/** CuÃ¡ntas decisiones se listan acÃ¡; el resto, en ConciliaciÃ³n. */
const DECISIONES_A_LA_VISTA = 6;

const RENGLON = "flex justify-between gap-3 text-[13px]";

export default async function SupervisionPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/clients");
  if (!isCostosRole(ctx.role)) redirect("/finanzas/pendientes");
  const todayISO = crDateParts(new Date()).dateKey;
  const d = await medirSupervision(todayISO);

  const porRevisar = d.revision.pagos.length + d.revision.gastos.length;
  const nombres = new Set([...d.revision.pagos, ...d.revision.gastos, ...d.revision.devueltos].map((f) => f.registradoPor));
  const equipo = nombres.size === 1 ? [...nombres][0]! : "el equipo";
  const c = d.complicada;

  return (
    <div className={`${SHELL_DEFAULT} space-y-5`}>
      <PageHeader
        title="SupervisiÃ³n"
        description="Lo que espera tu decisiÃ³n, el trabajo del equipo por revisar y la cobranza que se estÃ¡ complicando."
      />

      <section aria-label="Resumen" className="grid gap-3 sm:grid-cols-3">
        <a
          href="#decisiones"
          className={`flex flex-col gap-1 rounded-xl border p-4 ${
            d.filasPorDecidir > 0 ? "border-warn-line bg-warn-surface text-warn-ink" : "border-line bg-surface text-fg"
          }`}
        >
          <span className="text-xs">Esperan tu decisiÃ³n</span>
          <span className="text-[22px] font-bold leading-7 tabular-nums">{d.filasPorDecidir}</span>
          <span className="text-xs">Preguntas de negocio de Odoo y Mercury</span>
        </a>
        <a href="#revision" className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4 text-fg">
          <span className="text-xs text-fg-muted">Trabajo por revisar</span>
          <span className="text-[22px] font-bold leading-7 tabular-nums">{porRevisar}</span>
          <span className="text-xs text-fg-muted">
            {porRevisar === 0 ? "Todo revisado" : `De ${equipo}: pagos y gastos`}
          </span>
        </a>
        <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4 text-fg">
          <span className="text-xs text-fg-muted">Devuelto, sin corregir</span>
          <span className="text-[22px] font-bold leading-7 tabular-nums">{d.revision.devueltos.length}</span>
          <span className="text-xs text-fg-muted">Le llega a quien lo registrÃ³, en Pendientes</span>
        </div>
      </section>

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[2_1_600px] flex-col gap-5">
          <section id="decisiones" aria-label="Necesitan tu decisiÃ³n" className="rounded-xl border border-line bg-surface">
            <div className="flex flex-wrap items-baseline gap-x-2.5 px-4 pb-2.5 pt-3.5">
              <h2 className="text-[15px] font-semibold text-fg">Necesitan tu decisiÃ³n</h2>
              <span className="text-xs text-fg-muted">El equipo no las puede cerrar: son preguntas de negocio</span>
            </div>
            {d.decisiones.length === 0 ? (
              <p className="border-t border-line px-4 py-4 text-[13px] text-fg-muted">
                Nada espera tu decisiÃ³n. Cuando Odoo o Mercury digan algo que solo tÃº puedes contestar, aparece acÃ¡.
              </p>
            ) : (
              d.decisiones.slice(0, DECISIONES_A_LA_VISTA).map((x) => (
                <div key={x.codigo} className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 border-t border-line px-4 py-3">
                  <span className="w-[66px] shrink-0 rounded-full border border-line py-0.5 text-center text-xs font-semibold text-fg-secondary">
                    {x.fuente}
                  </span>
                  <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-0.5">
                    <span className="text-sm font-semibold leading-5 text-fg">{x.titulo}</span>
                    <span className="line-clamp-2 text-[13px] text-fg-secondary">{x.detalle}</span>
                  </div>
                  {x.plata && <span className="shrink-0 text-[13px] tabular-nums text-fg-secondary">{x.plata}</span>}
                  <Link
                    href="/finanzas/conciliacion?ver=decisiones"
                    className="shrink-0 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-fg-secondary hover:bg-surface-hover"
                  >
                    Decidir
                  </Link>
                </div>
              ))
            )}
            {d.decisiones.length > DECISIONES_A_LA_VISTA && (
              <div className="border-t border-line px-4 py-2.5 text-[13px] text-fg-secondary">
                Y {d.decisiones.length - DECISIONES_A_LA_VISTA} mÃ¡s.{" "}
                <Link href="/finanzas/conciliacion?ver=decisiones" className="font-semibold text-brand hover:text-brand-light">
                  Verlas todas en ConciliaciÃ³n
                </Link>
              </div>
            )}
          </section>

          <RevisionDelEquipo inicial={d.revision} />
        </div>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <section aria-label="Cobranza que se complica" className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface-muted p-4">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Cobranza que se complica</span>
            <div className={RENGLON}>
              <span className="text-fg-secondary">Vencido hace mÃ¡s de 90 dÃ­as</span>
              <span className="text-right font-semibold tabular-nums text-fg">{c.nMas90 ? textoDeMontos(c.mas90) : "nada"}</span>
            </div>
            <div className={RENGLON}>
              <span className="text-fg-secondary">Promesas que no se cumplieron</span>
              <span className="text-right font-semibold tabular-nums text-fg">{c.nPromesas ? textoDeMontos(c.promesas) : "ninguna"}</span>
            </div>
            {c.clientes.length > 0 && (
              <ul className="flex flex-col gap-1.5 border-t border-line pt-2 text-[13px] text-fg-secondary">
                {c.clientes.map((x) => (
                  <li key={x.cliente}>
                    <span className="font-medium text-fg">{x.cliente}</span> Â· {x.texto}
                  </li>
                ))}
              </ul>
            )}
            <Link href="/cobranza" className="text-[13px] font-semibold text-brand hover:text-brand-light">
              Ver en Cobranza
            </Link>
          </section>

          <section aria-label={`Lo que tiene ${equipo}`} className="flex flex-col gap-2 rounded-xl border border-line bg-surface-muted p-4">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
              Lo que tiene {equipo === "el equipo" ? "el equipo" : equipo}
            </span>
            <div className={RENGLON}>
              <span className="text-fg-secondary">Cuotas por facturar</span>
              <span className="font-semibold tabular-nums text-fg">{d.equipo.porFacturar}</span>
            </div>
            <div className={RENGLON}>
              <span className="text-fg-secondary">Pagos que Odoo o Mercury ya dan por pagados</span>
              <span className="font-semibold tabular-nums text-fg">{d.equipo.pagosDetectados}</span>
            </div>
            <div className={RENGLON}>
              <span className="text-fg-secondary">Diferencias por resolver</span>
              <span className="font-semibold tabular-nums text-fg">{d.equipo.diferencias}</span>
            </div>
            {d.equipo.gastosDelMes && (
              <div className={RENGLON}>
                <span className="text-fg-secondary">Gastos de {d.equipo.gastosDelMes.etiqueta}</span>
                <span className="font-semibold text-fg">
                  {d.equipo.gastosDelMes.listos
                    ? "completos"
                    : d.equipo.gastosDelMes.anotados
                      ? `${d.equipo.gastosDelMes.anotados} anotados`
                      : "sin anotar"}
                </span>
              </div>
            )}
            <div className={RENGLON}>
              <span className="text-fg-secondary">Devueltos por ti</span>
              <span className="font-semibold tabular-nums text-fg">{d.revision.devueltos.length}</span>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
