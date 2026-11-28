"use client";

/**
 * components/sessions/QuienEstuvo.tsx — «Quién estuvo» de una reunión (2026-11-27; globo desde el 2026-11-28).
 *
 * Elías, con Líneas Hospitalarias: el plegable debajo del título se veía desordenado. Ahora es una «i» que abre un globo
 * parecido a la lista de invitados de Google Calendar: arriba el resumen («Estuvieron 2 de 3 · nadie del cliente»), y cada
 * persona con su círculo de iniciales (la marca de su respuesta en la esquina), su nombre, quien organizó primero, su lado
 * (Smarteam, el cliente con su cargo, u otro con su dominio) y, si fue por Meet, si entró y cuántos minutos.
 *
 * ⚠ No es la «i» de «Equipo del cliente» (EquipoDeLaSesion): esa dice qué cambia al elegir el equipo. Esta va con su
 * nombre al lado del ícono de personas, y el globo se titula «Quién estuvo», para que no se confundan.
 *
 * Se abre al pasar el cursor o con el foco y se fija con un clic (como DeDondeSale); va en un portal con `position: fixed`
 * (usePanelFlotante), así ningún `overflow-hidden` lo corta. Solo tokens del tema. La regla y los textos viven en
 * lib/sessions/quien-estuvo.ts.
 */
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Users } from "lucide-react";
import { usePanelFlotante } from "@/components/ui/usePanelFlotante";
import { cn } from "@/lib/cn";
import { zClass } from "@/lib/ui/z";
import { inicialesDe, textoDeLaRespuesta, type PersonaDeLaReunion, type QuienEstuvo as QuienEstuvoDatos } from "@/lib/sessions/quien-estuvo";

const MS_ANTES_DE_CERRAR = 200;

const ROTULO_DEL_LADO: Record<PersonaDeLaReunion["lado"], string> = { smarteam: "Smarteam", cliente: "El cliente", otro: "Otro" };

/** La línea de abajo del nombre: «Organizador · Smarteam», «El cliente · Director», «hubspot.com». */
function detalle(p: PersonaDeLaReunion): string {
  const lado = p.lado === "otro" ? (p.dominio ?? "Entró sin correo") : ROTULO_DEL_LADO[p.lado];
  return [p.organizo ? "Organizador" : null, lado, p.cargo].filter(Boolean).join(" · ");
}

/** La marca de la respuesta en la esquina del círculo, como en Google Calendar (✓ sí, ✕ no, ? quizás). */
function MarcaDeLaRespuesta({ r }: { r: PersonaDeLaReunion["respuesta"] }) {
  if (r !== "ACEPTO" && r !== "RECHAZO" && r !== "TENTATIVA") return null;
  const tono = r === "ACEPTO" ? "bg-success text-success-fg" : r === "RECHAZO" ? "bg-danger-ink text-surface" : "bg-fg-muted text-surface";
  return (
    <span aria-hidden className={cn("absolute -bottom-0.5 -right-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold ring-2 ring-surface", tono)}>
      {r === "ACEPTO" ? "✓" : r === "RECHAZO" ? "✕" : "?"}
    </span>
  );
}

function Persona({ p }: { p: PersonaDeLaReunion }) {
  const respuesta = textoDeLaRespuesta(p.respuesta);
  const entro = p.entro === true ? (p.minutos !== null ? `Entró · ${p.minutos} min` : "Entró") : p.entro === false ? "No entró" : null;
  return (
    <li data-persona className="flex items-center gap-2.5 py-1">
      <span className="relative inline-flex h-8 w-8 flex-none items-center justify-center rounded-full bg-surface-muted text-[11px] font-semibold text-fg-secondary">
        {inicialesDe(p)}
        <MarcaDeLaRespuesta r={p.respuesta} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-fg" title={p.correo ?? undefined}>
          {p.nombre ?? p.correo ?? "Sin nombre"}
        </span>
        <span className="block truncate text-[11.5px] text-fg-muted">{detalle(p)}</span>
      </span>
      <span className="flex-none text-right text-[11.5px] leading-4">
        {entro && <span className={cn("block", p.entro ? "text-fg-secondary" : "text-fg-muted")}>{entro}</span>}
        {!entro && respuesta && <span className="block text-fg-muted">{respuesta}</span>}
      </span>
    </li>
  );
}

/** La «i» de «Quién estuvo» con su globo. */
export function InfoDeQuienEstuvo({ datos, className }: { datos: QuienEstuvoDatos; className?: string }) {
  const { abierto, alternar, cerrar, pos, rootRef, btnRef, panelRef } = usePanelFlotante({ side: "bottom", align: "start", selectorDeItems: "[data-persona]" });
  const [fijado, setFijado] = useState(false);
  const id = useId();
  const cierre = useRef<number | null>(null);
  const seguir = () => {
    if (cierre.current !== null) window.clearTimeout(cierre.current);
    cierre.current = null;
  };
  useEffect(() => seguir, []);
  if (datos.personas.length === 0) return null;
  const abrirSinFijar = () => {
    seguir();
    if (abierto) return;
    setFijado(false);
    alternar();
  };
  const soltar = () => {
    seguir();
    if (abierto && !fijado) cierre.current = window.setTimeout(cerrar, MS_ANTES_DE_CERRAR);
  };
  const alClic = () => {
    seguir();
    if (!abierto) {
      setFijado(true);
      alternar();
    } else if (!fijado) setFijado(true);
    else {
      setFijado(false);
      cerrar();
    }
  };
  return (
    <span ref={rootRef} className={cn("inline-flex", className)} onMouseEnter={abrirSinFijar} onMouseLeave={soltar}>
      <button
        ref={btnRef}
        type="button"
        aria-label={`Quién estuvo: ${datos.resumen}`}
        aria-expanded={abierto}
        aria-describedby={abierto ? id : undefined}
        data-sin-tip
        onFocus={abrirSinFijar}
        onBlur={soltar}
        onClick={alClic}
        className={cn(
          "inline-flex h-[22px] items-center gap-1 rounded-full border px-1.5 text-[11.5px] font-medium transition-colors hover:border-brand hover:text-brand",
          datos.nadieDelCliente ? "border-warn-line bg-warn-surface text-warn-ink" : "border-line bg-surface text-fg-muted",
        )}
      >
        <Users className="h-3 w-3" aria-hidden="true" />
        <span aria-hidden="true" className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current text-[9px] font-semibold">
          i
        </span>
      </button>
      {abierto &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            id={id}
            role="tooltip"
            className={cn("w-[320px] max-w-[calc(100vw-24px)] rounded-xl border border-line bg-surface p-3 shadow-lg", zClass("POPOVER"))}
            style={{ position: "fixed", ...pos }}
            onMouseEnter={seguir}
            onMouseLeave={soltar}
          >
            <p className="text-xs font-semibold text-fg">Quién estuvo</p>
            <p className={cn("text-xs", datos.nadieDelCliente ? "font-semibold text-warn-ink" : "text-fg-secondary")}>{datos.resumen}</p>
            {datos.nota && <p className="mt-1 text-[11.5px] text-fg-muted">{datos.nota}</p>}
            <ul className="mt-2 max-h-[320px] divide-y divide-line overflow-y-auto">
              {datos.personas.map((p, i) => (
                <Persona key={p.correo ?? `sin-correo-${i}`} p={p} />
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </span>
  );
}

/** «Quién estuvo» de una reunión, leído de su ruta (donde la pantalla no lo trae del servidor). null mientras llega. */
export function useQuienEstuvo(sessionId: string | null): QuienEstuvoDatos | null {
  const [datos, setDatos] = useState<{ id: string; q: QuienEstuvoDatos } | null>(null);
  useEffect(() => {
    if (!sessionId) return;
    const ctrl = new AbortController();
    fetch(`/api/sessions/${encodeURIComponent(sessionId)}/quien-estuvo`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ quienEstuvo: QuienEstuvoDatos }>) : null))
      .then((j) => {
        if (j?.quienEstuvo) setDatos({ id: sessionId, q: j.quienEstuvo });
      })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [sessionId]);
  // La de otra sesión (se cambió de pestaña) no se muestra mientras llega la nueva.
  return datos && datos.id === sessionId ? datos.q : null;
}
