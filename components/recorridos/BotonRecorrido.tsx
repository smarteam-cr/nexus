"use client";

/**
 * BotonRecorrido — el «Recorrido» de la cabecera de cada pantalla (tablero «Recorridos · diseño»).
 *
 *  · `cabecera`: con las otras acciones discretas de `CabeceraDeFicha` (12 px, gris).
 *  · `pagina`: botón blanco al lado de la acción azul del `PageHeader`.
 *
 * Un punto azul dice que no lo viste o que la pantalla cambió desde la última vez. La primera vez
 * (`INVITAR_LA_PRIMERA_VEZ`) ofrece verlo con una invitación chica, sin oscurecer nada, que se va
 * con «Ahora no». Fuera del shell interno no hay proveedor y no se pinta nada.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { zClass } from "@/lib/ui/z";
import { INVITAR_LA_PRIMERA_VEZ } from "@/lib/recorridos";
import { ROTULO } from "./estilos";
import { useRecorridos } from "./contexto";

function IconoDeRecorrido({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
    </svg>
  );
}

export function BotonRecorrido({ recorrido: deLaCabecera, variante }: { recorrido: string; variante: "cabecera" | "pagina" }) {
  const ctx = useRecorridos();
  /* Si una pieza del lienzo declaró el suyo (el cronograma dentro de la ficha), el botón ofrece ese.
     La `key` le da a cada recorrido su propio estado de invitación: sin ella, pasar de la ficha al
     cronograma arrastraba el «Ahora no» o el «ya invitado» del anterior. */
  const recorrido = ctx?.pantalla ?? deLaCabecera;
  return <BotonDelRecorrido key={recorrido} recorrido={recorrido} variante={variante} />;
}

function BotonDelRecorrido({ recorrido, variante }: { recorrido: string; variante: "cabecera" | "pagina" }) {
  const ctx = useRecorridos();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const clave = `nexus-recorrido-invitado-${recorrido}`;
  /* La invitación sale una vez por sesión del navegador hasta que la persona decide: si la ignora,
     no la persigue en cada visita. Se lee al montar (no en el efecto) para que el doble montaje de
     desarrollo no la apague antes de mostrarla. */
  const [yaInvitado] = useState(() => {
    try {
      return typeof window !== "undefined" && !!window.sessionStorage.getItem(clave);
    } catch {
      return false;
    }
  });
  const [invitacionCerrada, setInvitacionCerrada] = useState(false);

  const rec = ctx?.recorridos.find((r) => r.id === recorrido) ?? null;
  const estado = rec && ctx ? ctx.estado(rec.id) : "visto";
  const invitar = !!rec && INVITAR_LA_PRIMERA_VEZ && estado === "nuevo" && !yaInvitado && !invitacionCerrada && !ctx?.activo;

  /* La invitación flota en un portal (regla de lib/ui/z.ts): adentro de la cabecera la taparían
     el riel y el panel, que son `sticky`. Se ancla al botón y se recalcula al hacer scroll. */
  useEffect(() => {
    if (!invitar) return;
    try {
      window.sessionStorage.setItem(clave, "1");
    } catch {
      /* Sin sessionStorage: se invita igual, una vez por montaje. */
    }
    const calcular = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r || r.width === 0) return setPos(null);
      setPos({ top: r.bottom + 12, right: Math.max(8, window.innerWidth - r.right - 8) });
    };
    const primero = requestAnimationFrame(calcular);
    window.addEventListener("resize", calcular);
    window.addEventListener("scroll", calcular, true);
    return () => {
      cancelAnimationFrame(primero);
      window.removeEventListener("resize", calcular);
      window.removeEventListener("scroll", calcular, true);
    };
  }, [invitar, clave]);

  if (!ctx || !rec) return null;
  const conPunto = estado !== "visto";

  const clase =
    variante === "cabecera"
      ? "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
      : "inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-[7px] text-[13px] font-medium text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg";

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        data-recorrido="recorrido.boton"
        onClick={() => {
          setInvitacionCerrada(true);
          ctx.iniciar(rec.id);
        }}
        title={estado === "cambio" ? "La pantalla cambió desde que viste su recorrido" : "Ver el recorrido de esta pantalla"}
        className={clase}
      >
        <IconoDeRecorrido className="h-3.5 w-3.5" />
        Recorrido
        {conPunto && (
          <span className="h-[7px] w-[7px] rounded-full bg-brand" aria-label={estado === "cambio" ? "cambió" : "sin ver"} />
        )}
      </button>
      {invitar &&
        pos &&
        createPortal(
          <div
            role="dialog"
            aria-label="Invitación al recorrido"
            style={pos}
            className={cn(
              "fixed flex w-[300px] flex-col gap-2 rounded-xl border border-line bg-surface px-4 py-3.5 text-left shadow-xl",
              zClass("POPOVER"),
            )}
          >
            <span
              aria-hidden="true"
              className="absolute -top-[7px] right-7 h-3 w-3 rotate-45 border-l border-t border-line bg-surface"
            />
            <p className={ROTULO}>Primera vez en esta pantalla</p>
            <p className="text-[15px] font-semibold leading-[1.35] text-fg">{rec.invitacion.titulo}</p>
            <p className="text-[13px] leading-normal text-fg-secondary">{rec.invitacion.texto}</p>
            <div className="mt-0.5 flex items-center gap-4">
              <button
                type="button"
                onClick={() => {
                  setInvitacionCerrada(true);
                  ctx.iniciar(rec.id);
                }}
                className="rounded py-0.5 text-[13px] font-semibold text-brand transition-colors hover:text-brand-light"
              >
                Ver el recorrido
              </button>
              <button
                type="button"
                onClick={() => {
                  setInvitacionCerrada(true);
                  ctx.descartar(rec.id);
                }}
                className="rounded py-0.5 text-[13px] text-fg-muted transition-colors hover:text-fg"
              >
                Ahora no
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
