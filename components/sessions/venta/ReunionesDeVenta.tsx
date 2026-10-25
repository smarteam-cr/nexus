/**
 * Las piezas de «Reuniones de venta» (S1 y S2, 2026-10-25): la lista por empresa (cada empresa con sus reuniones de venta,
 * quién vendió, si dejó transcripción o por qué no, y su análisis) y el criterio escrito. Server components, solo tokens.
 */
import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { PROCESO_CONSULTIVO, PUNTOS_DEL_ANALISIS, SIN_POSICIONAMIENTO, VERSION_DEL_CRITERIO } from "@/lib/analizador-venta/criterio";
import { quienHabloEnPalabras } from "@/lib/analizador-venta/quien-hablo";
import type { EmpresaConReunionesDeVenta, ReunionDeVentaVista } from "@/lib/analizador-venta/reuniones-de-venta-server";

const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "short", timeZone: "America/Costa_Rica" }).replace(".", "");

const TEXTO: Record<ReunionDeVentaVista["texto"], { texto: string; clase: string }> = {
  transcripcion: { texto: "✓ Con transcripción", clase: "bg-success-surface text-success-ink" },
  solo_notas: { texto: "● Solo notas", clase: "bg-surface-muted text-fg-secondary" },
  nada: { texto: "○ Sin texto", clase: "bg-warn-surface text-warn-ink" },
};

function Fila({ r }: { r: ReunionDeVentaVista }) {
  const t = TEXTO[r.texto];
  return (
    <div className="grid grid-cols-[64px_minmax(200px,1.4fr)_minmax(140px,1fr)_150px_minmax(260px,2fr)] items-start gap-3 border-t border-line px-4 py-2.5 text-[13px] first:border-t-0">
      <span className="text-xs text-fg-muted">{fechaCorta(r.fecha)}</span>
      <span className="flex min-w-0 flex-col">
        <Link href={`/sessions/${r.id}`} className="truncate font-semibold text-fg hover:text-brand">
          {r.titulo}
        </Link>
        {r.referencia && <span className="text-xs font-semibold text-brand">Reunión de referencia</span>}
      </span>
      <span className="text-fg-secondary">{r.vendedores.join(", ") || "—"}</span>
      <span>
        <span className={cn("inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold", t.clase)}>{t.texto}</span>
      </span>
      <span className="space-y-1 text-xs leading-[17px] text-fg-secondary">
        {r.motivo && <span className="block">{r.motivo}</span>}
        {r.analisis?.estado === "ERROR" && <span className="block text-warn-ink">El análisis falló: {r.analisis.error ?? "sin detalle"}</span>}
        {r.analisis?.resumen && <span className="block text-fg">{r.analisis.resumen}</span>}
        {r.analisis?.quienHablo && <span className="block text-fg-muted">{quienHabloEnPalabras(r.analisis.quienHablo)}</span>}
        {!!r.analisis?.exploradas.length && <span className="block">Se exploró: {r.analisis.exploradas.join(", ")}</span>}
        {!!r.analisis?.sinExplorar.length && <span className="block text-warn-ink">Sin explorar: {r.analisis.sinExplorar.join(", ")}</span>}
        {!r.analisis && r.texto === "transcripcion" && <span className="block text-fg-muted">Sin analizar: ábrela para analizarla.</span>}
      </span>
    </div>
  );
}

export function ListaPorEmpresa({ empresas, abierta }: { empresas: readonly EmpresaConReunionesDeVenta[]; abierta: string | null }) {
  if (!empresas.length) {
    return <EmptyState title="No hubo reuniones de venta en estos 90 días" description="Cuentan las reuniones con un prospecto, y las de un cliente en las que estuvo alguien de Ventas." />;
  }
  return (
    <section aria-label="Por empresa" className="overflow-hidden rounded-2xl border border-line bg-surface">
      {empresas.map((e) => (
        <details key={e.id} className="group border-t border-line first:border-t-0" open={abierta === e.id || empresas.length === 1}>
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-surface-hover group-open:bg-surface-muted [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="truncate text-[13px] font-semibold text-fg">{e.nombre}</span>
              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-fg-secondary">{e.kind === "PROSPECTO" ? "Prospecto" : "Cliente"}</span>
            </span>
            <span className="text-xs text-fg-muted">
              {e.reuniones.length} {e.reuniones.length === 1 ? "reunión" : "reuniones"} · {e.conTranscripcion} con transcripción · {e.analizadas} analizadas
            </span>
          </summary>
          <div className="overflow-x-auto bg-surface-muted px-5 pb-4 pt-1">
            <div className="min-w-[900px] overflow-hidden rounded-xl border border-line bg-surface">
              <div className="grid grid-cols-[64px_minmax(200px,1.4fr)_minmax(140px,1fr)_150px_minmax(260px,2fr)] gap-3 border-b border-line px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                <span>Fecha</span>
                <span>Reunión</span>
                <span>Vendió</span>
                <span>Texto</span>
                <span>Cómo fue</span>
              </div>
              {e.reuniones.map((r) => (
                <Fila key={r.id} r={r} />
              ))}
            </div>
          </div>
        </details>
      ))}
    </section>
  );
}

export function ElCriterio({ positionStatement, referencias }: { positionStatement: string | null; referencias: { sessionId: string; titulo: string; fecha: string; nota: string | null }[] }) {
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-fg-secondary">
        Lo que mira el analizador en cada reunión de venta (versión {VERSION_DEL_CRITERIO}). Es la primera propuesta: la revisan Elías y Andrés, y lo que haya que
        cambiar se cambia en el código (lib/analizador-venta/criterio.ts) con una versión nueva.
      </p>
      <section aria-label="El proceso consultivo" className="space-y-3">
        <h2 className="text-sm font-semibold text-fg">El proceso consultivo</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {PROCESO_CONSULTIVO.map((e, i) => (
            <div key={e.id} className="space-y-2 rounded-xl border border-line bg-surface p-4">
              <p className="text-sm font-semibold text-fg">
                {i + 1}. {e.nombre}
              </p>
              <p className="text-[13px] leading-[19px] text-fg">{e.seEspera}</p>
              <p className="text-xs text-success-ink">Se hizo si: {e.seHizo.join("; ")}.</p>
              <p className="text-xs text-warn-ink">Se saltó si: {e.seSalto.join("; ")}.</p>
            </div>
          ))}
        </div>
      </section>
      <section aria-label="Lo que responde cada análisis" className="space-y-2">
        <h2 className="text-sm font-semibold text-fg">Lo que responde cada análisis</h2>
        <ol className="list-decimal space-y-1 pl-5 text-[13px] text-fg">
          {PUNTOS_DEL_ANALISIS.map((p) => (
            <li key={p.id}>{p.titulo}</li>
          ))}
        </ol>
        <p className="text-xs text-fg-muted">Cada juicio trae su cita textual de la transcripción; sin cita, no hay juicio. No hay puntaje ni ranking entre vendedores.</p>
      </section>
      <section aria-label="El posicionamiento" className="space-y-1">
        <h2 className="text-sm font-semibold text-fg">El posicionamiento de Smarteam</h2>
        <p className="text-[13px] text-fg">{positionStatement?.trim() || SIN_POSICIONAMIENTO}</p>
      </section>
      <section aria-label="Reuniones de referencia" className="space-y-1">
        <h2 className="text-sm font-semibold text-fg">Reuniones de referencia</h2>
        {referencias.length ? (
          <ul className="space-y-1 text-[13px]">
            {referencias.map((r) => (
              <li key={r.sessionId}>
                <Link href={`/sessions/${r.sessionId}`} className="font-semibold text-brand hover:text-brand-dark">
                  {r.titulo}
                </Link>{" "}
                <span className="text-fg-muted">({fechaCorta(r.fecha)})</span>
                {r.nota && <span className="text-fg-secondary"> — {r.nota}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-fg-secondary">
            Ninguna todavía. La candidata es «Camosa l Exploración de retos operativos» (23 oct): ábrela y usa «Marcar como referencia». Se muestran al lado de cada
            análisis para comparar; el analizador no las lee (son de otra empresa).
          </p>
        )}
      </section>
    </div>
  );
}
