"use client";

/**
 * usePanelFlotante — la mecánica de un desplegable anclado a un botón.
 *
 * ── POR QUÉ ES UN HOOK Y NO ESTÁ COPIADO ─────────────────────────────────────
 * Esto vivía adentro de `Menu.tsx`, que era «la ÚNICA implementación de esa mecánica de ahora en
 * más». Al aparecer el segundo desplegable —el select editable de una celda de tabla— había que
 * elegir entre copiar 40 líneas sutiles o extraerlas. Copiarlas es exactamente el modo de falla
 * que este repo ya pagó varias veces: dos implementaciones de la misma regla divergen, y la
 * segunda se olvida del detalle que la primera aprendió a los golpes.
 *
 * Los detalles que se aprendieron a los golpes, y que por eso viven acá y no en cada consumidor:
 *
 *   · **`position: fixed` calculada desde el trigger**, no `absolute`. Un panel `absolute` lo
 *     recorta cualquier ancestro con `overflow-hidden` — es el bug del rail colapsado, y también
 *     el de una tabla con scroll horizontal.
 *   · **El scroll EXTERNO cierra; el interno no.** Las coordenadas se congelan al abrir, así que
 *     un scroll de la página desancla el panel. Pero el scroll DENTRO del panel (su propio
 *     `maxHeight`) es un descendiente y no tiene que cerrarlo. Por eso el listener va en fase de
 *     captura y compara contra `rootRef`.
 *   · **Escape devuelve el foco al trigger**, o quien navega con teclado queda en el limbo.
 *   · **Home/End NO se interceptan cuando el foco está en un campo de texto**: ahí significan
 *     "principio/fin de la línea" y robárselo rompe el buscador que vive dentro del panel.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

export interface OpcionesDePanel {
  side?: "top" | "bottom";
  align?: "start" | "end";
  /**
   * Qué elementos recorren las flechas. Cambia según la semántica del panel:
   * `[role="menuitem"]` en un menú de acciones, `[role="option"]` en un select.
   */
  selectorDeItems: string;
}

export function usePanelFlotante({
  side = "bottom",
  align = "start",
  selectorDeItems,
}: OpcionesDePanel) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const calcularPos = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const style: CSSProperties = {};
    if (side === "top") style.bottom = window.innerHeight - r.top + 6;
    else style.top = r.bottom + 6;
    if (align === "start") style.left = r.left;
    else style.right = window.innerWidth - r.right;
    setPos(style);
  }, [side, align]);

  const alternar = useCallback(() => {
    setAbierto((p) => {
      if (!p) calcularPos();
      return !p;
    });
  }, [calcularPos]);

  const cerrar = useCallback(() => setAbierto(false), []);

  useEffect(() => {
    if (!abierto) return;

    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setAbierto(false);
    }
    function onScroll(e: Event) {
      /* Coordenadas congeladas al abrir: un scroll EXTERNO desancla el panel → cerrar. El
         scroll de adentro (su propio `maxHeight`) es descendiente y no cuenta. */
      if (rootRef.current && e.target instanceof Node && rootRef.current.contains(e.target)) return;
      setAbierto(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setAbierto(false);
        btnRef.current?.focus();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") {
        return;
      }
      /* ⚠ Home/End dentro de un campo de texto significan "principio/fin de línea". Robárselos
         rompe el buscador que vive adentro del panel — se escribe mal un nombre y no se puede
         volver al principio para corregirlo. Las flechas sí se interceptan: en un panel abierto
         "bajar" es recorrer las opciones, no mover el cursor. */
      const enTexto =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement;
      if (enTexto && (e.key === "Home" || e.key === "End")) return;

      const els = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(selectorDeItems) ?? []);
      if (els.length === 0) return;
      e.preventDefault();
      const i = els.indexOf(document.activeElement as HTMLElement);
      const next =
        e.key === "Home" ? 0
        : e.key === "End" ? els.length - 1
        : e.key === "ArrowDown" ? (i + 1) % els.length
        : (i - 1 + els.length) % els.length;
      els[next]?.focus();
    }

    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", calcularPos);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", calcularPos);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [abierto, calcularPos, selectorDeItems]);

  return { abierto, setAbierto, alternar, cerrar, pos, rootRef, btnRef, panelRef };
}
