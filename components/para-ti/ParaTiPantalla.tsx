"use client";

/**
 * ParaTiPantalla — la pantalla «Para ti» (2026-10-04), medida por medida del tablero «Notificaciones · diseño».
 *
 * «Lo mío»: arriba, una sola vez, lo que dejó un agente (azul, con la chispa); después los hechos por cuándo («Para hoy»,
 * «Esta semana» y, plegado, «Cuando puedas»). A la derecha, los AVISOS (lo que pasó) y lo que se revisó y está al día.
 */
import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconoDeSugerencia, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { fetchJson } from "@/lib/api/fetch-json";
import { avisarCambioDeParaTi } from "./cuenta";
import type { AvisoVisto, ParaTi, Pendiente } from "@/lib/para-ti/tipos";

const BOTON_BLANCO =
  "shrink-0 rounded-md border border-line bg-surface px-2.5 py-[5px] text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg";

const plural = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);

function cuandoFue(iso: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "Recién";
  if (min < 60) return `Hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `Hace ${h} h`;
  if (h < 48) return "Ayer";
  return d.toLocaleDateString("es-CR", { weekday: "short", day: "numeric", month: "short" });
}

export default function ParaTiPantalla({
  medicion,
  avisos: avisosIniciales,
  resumen,
}: {
  medicion: ParaTi;
  avisos: AvisoVisto[];
  resumen: string;
}) {
  const router = useRouter();
  const [avisos, setAvisos] = useState(avisosIniciales);
  const [luegoAbierto, setLuegoAbierto] = useState(false);

  // Si el servidor manda avisos nuevos (router.refresh), mandan ellos: se ajusta al render, sin efecto.
  const [avisosDelServidor, setAvisosDelServidor] = useState(avisosIniciales);
  if (avisosDelServidor !== avisosIniciales) {
    setAvisosDelServidor(avisosIniciales);
    setAvisos(avisosIniciales);
  }

  const marcar = useCallback(
    async (ids: string[] | "todos") => {
      setAvisos((as) => as.map((a) => (ids === "todos" || ids.includes(a.id) ? { ...a, nuevo: false } : a)));
      try {
        await fetchJson("/api/para-ti/avisos/leidos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ids === "todos" ? { todos: true } : { ids }),
        });
        avisarCambioDeParaTi();
      } catch {
        router.refresh();
      }
    },
    [router],
  );

  const nMio = medicion.agente.length + medicion.hoy.length + medicion.semana.length + medicion.luego.length;
  const nuevos = avisos.filter((a) => a.nuevo).length;

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-fg-muted">{resumen}</p>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[2_1_560px] flex-col gap-5">
          {medicion.agente.length > 0 && <LoDelAgente items={medicion.agente} />}
          <Bloque titulo="Para hoy" items={medicion.hoy} />
          <Bloque titulo="Esta semana" items={medicion.semana} />
          {medicion.luego.length > 0 && (
            <section className="rounded-xl border border-line bg-surface">
              <button
                type="button"
                aria-expanded={luegoAbierto}
                onClick={() => setLuegoAbierto((v) => !v)}
                className="flex w-full items-baseline gap-2.5 px-4 py-3.5 text-left"
              >
                <span className="text-[15px] font-semibold text-fg">Cuando puedas</span>
                <span className="text-xs text-fg-muted">{plural(medicion.luego.length, "cosa", "cosas")}</span>
                <span className="ml-auto text-xs text-brand">{luegoAbierto ? "Ocultar" : "Mostrar"}</span>
              </button>
              {luegoAbierto &&
                medicion.luego.map((it) => (
                  <div key={it.clave} className="flex items-center gap-3 border-t border-line px-4 py-2.5 text-[13px] text-fg-secondary">
                    <span aria-hidden className="h-2 w-2 flex-none rounded-full border-[1.5px] border-line" />
                    <span className="min-w-0 flex-1">{it.titulo}</span>
                    <Link href={it.href} className="flex-none text-xs text-brand hover:text-brand-light">
                      Ir
                    </Link>
                  </div>
                ))}
            </section>
          )}
          {nMio === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-surface-muted p-6 text-center">
              <b className="text-sm font-semibold text-fg">No tienes nada pendiente</b>
              <span className="text-[13px] text-fg-muted">Lo que te toque hacer en Nexus va a aparecer acá, con el botón que lleva a donde se hace.</span>
            </div>
          )}
        </div>

        <aside className="flex min-w-0 max-w-[380px] flex-[1_1_300px] flex-col gap-4">
          <section aria-label="Avisos" className="flex flex-col gap-1 rounded-xl border border-line bg-surface-muted p-4">
            <div className="flex items-center gap-2 pb-1.5">
              <span className={ROTULO_DEL_SISTEMA}>Avisos</span>
              {nuevos > 0 && (
                <span className="rounded-full border border-info-line bg-info-surface px-[7px] text-[11px] font-semibold leading-[18px] text-brand">
                  {plural(nuevos, "nuevo", "nuevos")}
                </span>
              )}
              {nuevos > 0 && (
                <button
                  type="button"
                  onClick={() => marcar("todos")}
                  className="ml-auto rounded px-1.5 py-1 text-xs text-fg-muted transition-colors hover:text-fg"
                >
                  Marcar como leídos
                </button>
              )}
            </div>
            {avisos.length === 0 ? (
              <p className="px-2 py-1.5 text-[13px] text-fg-muted">Todavía no te llegó ningún aviso.</p>
            ) : (
              avisos.map((a) => (
                <Link
                  key={a.id}
                  href={a.href}
                  onClick={() => a.nuevo && marcar([a.id])}
                  className={cn(
                    "flex items-start gap-2.5 rounded-lg border p-2 text-fg transition-colors",
                    a.nuevo ? "border-line bg-surface hover:bg-surface-hover" : "border-transparent hover:bg-surface-hover",
                  )}
                >
                  <span aria-hidden className={cn("mt-1.5 h-2 w-2 flex-none rounded-full", a.nuevo ? "bg-primary" : "bg-transparent")} />
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className={cn("text-[13px] leading-[19px]", a.nuevo ? "font-semibold text-fg" : "text-fg-secondary")}>
                      {a.bueno && <span className="font-semibold text-success-ink">✓ </span>}
                      {a.titulo}
                    </span>
                    {a.detalle && <span className="text-xs leading-[17px] text-fg-muted">{a.detalle}</span>}
                    <span className="text-xs leading-4 text-fg-muted">{cuandoFue(a.creadoAt)}</span>
                  </span>
                </Link>
              ))
            )}
            <span className="px-2 pt-2 text-xs leading-[17px] text-fg-muted">
              Un aviso es algo que pasó. Lo que te toca hacer está a la izquierda y se va solo cuando se resuelve.
            </span>
          </section>

          {(medicion.alDia.length > 0 || medicion.sinMedir.length > 0) && (
            <section aria-label="Al día" className="flex flex-col gap-2 rounded-xl border border-line bg-surface-muted p-4">
              {medicion.alDia.length > 0 && (
                <>
                  <span className={ROTULO_DEL_SISTEMA}>También revisé y está al día</span>
                  {medicion.alDia.map((t) => (
                    <span key={t} className="flex gap-2 text-[13px] leading-[19px] text-fg-secondary">
                      <span className="font-semibold text-success-ink">✓</span>
                      <span>{t}</span>
                    </span>
                  ))}
                </>
              )}
              {medicion.sinMedir.length > 0 && (
                <p className="text-xs leading-[17px] text-warn-ink">
                  No se pudo revisar ahora: {medicion.sinMedir.join(", ").toLowerCase()}. Vuelve a abrir la página en un rato.
                </p>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

/** Cuando un pendiente junta varios lugares (alertas de distintas cuentas): cada uno con su enlace directo. */
function Enlaces({ enlaces }: { enlaces?: Pendiente["enlaces"] }) {
  if (!enlaces?.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-4">
      {enlaces.map((e) => (
        <Link key={e.href} href={e.href} className="text-brand hover:text-brand-light">
          {e.texto}
        </Link>
      ))}
    </div>
  );
}

function LoDelAgente({ items }: { items: Pendiente[] }) {
  return (
    <section aria-label="Lo que dejó el agente" className="flex flex-col gap-1.5">
      <div className={cn(ROTULO_DEL_SISTEMA, "flex items-center gap-1.5 text-brand")}>
        <IconoDeSugerencia className="h-[13px] w-[13px] flex-none" />
        <span>Lo que dejó el agente para que decidas · {items.length}</span>
      </div>
      {items.map((s) => (
        <div
          key={s.clave}
          className="flex flex-wrap items-start gap-2.5 rounded-lg border border-info-line bg-info-surface py-2.5 pl-3 pr-2.5"
        >
          <IconoDeSugerencia className="mt-0.5 h-[15px] w-[15px] flex-none text-brand" />
          <div className="min-w-0 flex-[1_1_300px]">
            <div className="text-[11px] font-semibold text-brand">{s.meta}</div>
            <div className="text-sm font-semibold leading-5 text-fg">{s.titulo}</div>
            <div className="mt-0.5 text-xs leading-[17px] text-fg-muted">{s.detalle}</div>
            <Enlaces enlaces={s.enlaces} />
          </div>
          <Link href={s.href} className={cn(BOTON_BLANCO, "self-center")}>
            {s.accion}
          </Link>
        </div>
      ))}
    </section>
  );
}

function Bloque({ titulo, items }: { titulo: string; items: Pendiente[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label={titulo} className="flex flex-col rounded-xl border border-line bg-surface">
      <div className="flex items-baseline gap-2.5 px-4 pb-2.5 pt-3.5">
        <h2 className="text-[15px] font-semibold text-fg">{titulo}</h2>
        <span className="text-xs text-fg-muted">{plural(items.length, "cosa", "cosas")}</span>
      </div>
      {items.map((it) => (
        <div key={it.clave} className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 border-t border-line px-4 py-3">
          <span aria-hidden className={cn("h-2 w-2 flex-none rounded-full", it.error ? "bg-destructive" : "bg-warning")} />
          <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-0.5">
            <span className="text-sm font-semibold leading-5 text-fg">{it.titulo}</span>
            <span className="text-[13px] leading-[19px] text-fg-secondary">{it.detalle}</span>
            <Enlaces enlaces={it.enlaces} />
            <span className={cn("text-xs leading-4", it.error ? "text-danger-ink" : "text-fg-muted")}>{it.meta}</span>
          </div>
          {it.plata && <span className="flex-none text-[13px] tabular-nums text-fg-secondary">{it.plata}</span>}
          <Link href={it.href} className={BOTON_BLANCO}>
            {it.accion}
          </Link>
        </div>
      ))}
    </section>
  );
}

