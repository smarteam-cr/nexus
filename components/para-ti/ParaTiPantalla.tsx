"use client";

/**
 * ParaTiPantalla — la pantalla «Para ti» (2026-10-04), medida por medida del tablero «Notificaciones · diseño».
 *
 * «Lo mío»: arriba, «Lo que importa hoy» (fase 1.1 de docs/nexus-sistema-de-trabajo-plan.md): como mucho cinco, una
 * por cuenta, con lo demás de esa cuenta plegado («+N en esta cuenta»); lo que dejó un agente va ahí con la chispa. Lo
 * de hoy que no entró, en «También para hoy»; después «Esta semana» y, plegado, «Cuando puedas». A la derecha, los
 * AVISOS (lo que pasó) y lo que se revisó y está al día.
 */
import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconoDeSugerencia, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { fetchJson } from "@/lib/api/fetch-json";
import { avisarCambioDeParaTi } from "./cuenta";
import PendienteDeTiempos from "@/components/tiempos/PendienteDeTiempos";
import { PENDIENTE_DE_TIEMPOS } from "@/lib/tiempos/reglas";
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

  const nMio = medicion.importa.length + medicion.tambien.length + medicion.semana.length + medicion.luego.length;
  const nuevos = avisos.filter((a) => a.nuevo).length;

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-fg-muted">{resumen}</p>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[2_1_560px] flex-col gap-5">
          <Bloque titulo="Lo que importa hoy" items={medicion.importa} nota="Una cosa por cuenta, la más importante" />
          <Bloque titulo="También para hoy" items={medicion.tambien} />
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
                    // Un mensaje sin leer va en ámbar: alguien te escribió y espera de ti.
                    a.nuevo && a.mensaje
                      ? "border-warn-line bg-warn-surface hover:border-warning"
                      : a.nuevo
                        ? "border-line bg-surface hover:bg-surface-hover"
                        : "border-transparent hover:bg-surface-hover",
                  )}
                >
                  <span aria-hidden className={cn("mt-1.5 h-2 w-2 flex-none rounded-full", a.nuevo ? (a.mensaje ? "bg-warning" : "bg-primary") : "bg-transparent")} />
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    {a.nuevo && a.mensaje && <span className="text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-warn-ink">Mensaje</span>}
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
      {enlaces.map((e) =>
        /^https?:\/\//.test(e.href) ? (
          // Un enlace a HubSpot (la lista de limpieza) se abre aparte: Nexus queda donde estaba.
          <a key={e.href} href={e.href} target="_blank" rel="noreferrer" className="text-brand hover:text-brand-light">
            {e.texto} ↗
          </a>
        ) : (
          <Link key={e.href} href={e.href} className="text-brand hover:text-brand-light">
            {e.texto}
          </Link>
        ),
      )}
    </div>
  );
}

function Bloque({ titulo, items, nota }: { titulo: string; items: Pendiente[]; nota?: string }) {
  if (items.length === 0) return null;
  return (
    <section aria-label={titulo} className="flex flex-col rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-baseline gap-2.5 px-4 pb-2.5 pt-3.5">
        <h2 className="text-[15px] font-semibold text-fg">{titulo}</h2>
        <span className="text-xs text-fg-muted">
          {plural(items.length, "cosa", "cosas")}
          {nota ? ` · ${nota}` : ""}
        </span>
      </div>
      {items.map((it) => (
        <Fila key={it.clave} it={it} />
      ))}
    </section>
  );
}

function Fila({ it, dentro = false }: { it: Pendiente; dentro?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  // «¿Cuánto te tomó?» se contesta ahí mismo, sin salir de «Para ti» (2026-10-05).
  if (it.fuente === PENDIENTE_DE_TIEMPOS) return <PendienteDeTiempos item={it} />;
  const otros = it.otrosEnLaCuenta ?? [];
  return (
    <>
      <div className={cn("flex flex-wrap items-center gap-x-3.5 gap-y-2.5 border-t border-line px-4 py-3", dentro && "bg-surface-muted pl-8")}>
        {it.delAgente ? (
          <span title="Lo dejó un agente para que decidas" className="flex-none text-brand">
            <IconoDeSugerencia className="h-[13px] w-[13px]" />
          </span>
        ) : (
          <span aria-hidden className={cn("h-2 w-2 flex-none rounded-full", it.error ? "bg-destructive" : "bg-warning")} />
        )}
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-0.5">
          <span className="text-sm font-semibold leading-5 text-fg">{it.titulo}</span>
          <span className="text-[13px] leading-[19px] text-fg-secondary">{it.detalle}</span>
          <Enlaces enlaces={it.enlaces} />
          <span className={cn("text-xs leading-4", it.error ? "text-danger-ink" : it.delAgente ? "text-brand" : "text-fg-muted")}>{it.meta}</span>
          {otros.length > 0 && (
            <button type="button" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)} className="self-start text-xs text-brand hover:text-brand-light">
              {abierto ? "Ocultar" : `+${otros.length} en esta cuenta`}
            </button>
          )}
        </div>
        {it.plata && <span className="flex-none text-[13px] tabular-nums text-fg-secondary">{it.plata}</span>}
        <Link href={it.href} className={BOTON_BLANCO}>
          {it.accion}
        </Link>
      </div>
      {abierto && otros.map((o) => <Fila key={o.clave} it={o} dentro />)}
    </>
  );
}
