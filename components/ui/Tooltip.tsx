"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { crearPrestamoDeTitle, disparadorEntre, sePuedePrestar } from "@/lib/ui/prestamo-de-title";

/**
 * Tooltip — LA capa de ayuda de Nexus.
 *
 * ── POR QUÉ ES UNA CAPA GLOBAL Y NO UN COMPONENTE QUE SE ENVUELVE ────────────
 * Nexus tiene ~500 `title="…"` repartidos por toda la app: encabezados de tabla, chips de
 * clase de proyecto, celdas de fecha, botones de ícono. Todos ellos pintaban la caja negra
 * del sistema operativo: fuente distinta a la del producto, retraso de ~1 s que nadie
 * eligió, sin tema claro/oscuro y recortada por el borde de la ventana.
 *
 * Migrar 500 call sites a un `<Tooltip>` que envuelve habría sido 500 oportunidades de
 * olvidarse uno, y el que se olvida se ve peor que antes: una caja negra sola en medio de
 * una interfaz que ya no las tiene. Esta capa hace lo contrario — le **presta** el `title`
 * que ya está escrito: al pasar el mouse le saca el atributo al elemento (para que el
 * sistema operativo no lo pinte), lo dibuja ella misma con los tokens del tema, y se lo
 * devuelve al salir. No hay nada que migrar y no hay forma de olvidarse uno.
 *
 * Los detalles que valen la pena, y que por eso viven acá y no en cada consumidor:
 *
 *   · **`position: fixed` + portal a `body`.** Un tooltip `absolute` lo recorta cualquier
 *     ancestro con `overflow-hidden` — que en esta app es la tabla con scroll horizontal y
 *     el rail lateral `sticky`. Es el mismo aprendizaje que `usePanelFlotante`.
 *   · **Se saca el `title`, pero NO el nombre accesible.** Si el elemento no tenía texto ni
 *     `aria-label`, el `title` ERA su nombre para un lector de pantalla: sacarlo lo dejaría
 *     mudo. Por eso, en ese caso, se copia a `aria-label` antes de sacarlo.
 *   · **El teclado lo abre sin retraso.** El hover espera ~240 ms (si no, recorrer una tabla
 *     dispara veinte tooltips), pero llegar por `Tab` es una intención explícita.
 *   · **Se cierra con Escape, con el scroll y con el click.** Las coordenadas se congelan al
 *     abrir; un scroll lo desancla, y un tooltip que sobrevive al click del botón que lo
 *     abrió queda flotando sobre la pantalla siguiente.
 *   · **El `title` se DEVUELVE al salir, y el texto nunca se guarda en el DOM.** Esta capa
 *     vive en el shell —que hidrata primero— y escucha el documento entero, así que puede
 *     tocar un nodo que React todavía no hidrató; si el atributo no vuelve, React encuentra
 *     un DOM que no coincide con lo que renderiza y lo reporta. El porqué completo, con el
 *     diff real que lo delató, está en `lib/ui/prestamo-de-title.ts`.
 *
 * Opt-out: `data-sin-tip` en el elemento (o en cualquier ancestro) deja pasar el `title`
 * nativo. Se usa donde el `title` NO es ayuda sino metadato (un `<iframe>`, por ejemplo,
 * que ya está excluido por tipo).
 */

/** Hover: espera. Recorrer una tabla no debería disparar veinte tooltips. */
const RETRASO_HOVER_MS = 240;
/** Separación entre el tooltip y el elemento que lo dispara. */
const MARGEN = 8;
/** Aire mínimo contra el borde de la ventana. */
const BORDE = 6;

type Lado = "top" | "bottom";

interface Anclaje {
  texto: string;
  /** Rect del trigger CONGELADO al abrir — por eso el scroll cierra en vez de reubicar. */
  rect: DOMRect;
}

/**
 * Se monta UNA vez, en el shell de la app (`AppShell`). No recibe props ni tiene estado
 * que le importe a nadie más: escucha el documento y dibuja.
 */
export function TooltipLayer() {
  const [anclaje, setAnclaje] = useState<Anclaje | null>(null);
  const [montado, setMontado] = useState(false);
  const nodoRef = useRef<HTMLDivElement>(null);
  const flechaRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<number | null>(null);
  const activoRef = useRef<HTMLElement | null>(null);

  // Mismo mount guard SSR-safe que Modal/Drawer: el portal solo existe en el cliente.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- mount guard intencional (portal SSR)
  useEffect(() => setMontado(true), []);

  useEffect(() => {
    /* El texto vive acá, FUERA del DOM, y el `title` se devuelve al salir. Ver el porqué en
       `lib/ui/prestamo-de-title.ts`: guardarlo en el nodo rompía la hidratación. */
    const prestamo = crearPrestamoDeTitle();
    /** El único elemento con el `title` prestado ahora mismo. Como máximo hay uno. */
    let prestado: HTMLElement | null = null;

    /** Cambia de deudor: le devuelve el `title` al anterior antes de tomarle el nuevo. */
    function fijarPrestado(el: HTMLElement | null) {
      if (prestado === el) return;
      prestamo.devolver(prestado);
      prestado = el;
    }

    function candidato(target: EventTarget | null): HTMLElement | null {
      if (!(target instanceof Element)) return null;
      /* Al elemento que tiene el `title` prestado ya no se lo ve con `[title]` —se lo llevó
         esta capa—, y por eso el desempate no puede quedar en manos de `closest` solo. El
         porqué y los cuatro casos están en `disparadorEntre`. */
      const el = disparadorEntre(prestado, target.closest<HTMLElement>("[title]"), target);
      if (!el) return null;
      /* En un `<iframe>` el `title` no es ayuda: es su nombre accesible, y el navegador ni
         siquiera lo pinta. Lo mismo para cualquier subárbol que pidió quedarse afuera. */
      if (el.tagName === "IFRAME") return null;
      if (el.closest("[data-sin-tip]")) return null;
      return el;
    }

    function cancelarTimer() {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    function ocultar() {
      cancelarTimer();
      activoRef.current = null;
      setAnclaje((p) => (p === null ? p : null));
    }

    /**
     * Cierra Y devuelve el `title`.
     *
     * ⚠ Está separado de `ocultar()` a propósito. El scroll y el click cierran con el cursor
     * TODAVÍA encima del elemento: devolverle el atributo ahí haría que el sistema operativo
     * pinte su caja negra justo después de que escondimos la nuestra. El préstamo se salda
     * cuando el puntero se va, no cuando el globo se cierra.
     */
    function soltar() {
      ocultar();
      fijarPrestado(null);
    }

    function mostrar(el: HTMLElement, inmediato: boolean) {
      /* Con el documento todavía llegando hay HTML que React no hidrató: tocarlo ahí es el
         error de hidratación. Ver `sePuedePrestar` — durante ese rato gana la caja negra. */
      if (!sePuedePrestar(document.readyState)) return;
      fijarPrestado(el);
      const texto = prestamo.adoptar(el);
      if (!texto) {
        fijarPrestado(null);
        return;
      }
      cancelarTimer();
      activoRef.current = el;
      const abrir = () => {
        timerRef.current = null;
        // El elemento pudo desmontarse mientras corría el retraso (una fila que se re-ordena).
        if (activoRef.current !== el || !el.isConnected) return;
        setAnclaje({ texto, rect: el.getBoundingClientRect() });
      };
      if (inmediato) abrir();
      else timerRef.current = window.setTimeout(abrir, RETRASO_HOVER_MS);
    }

    function onPointerOver(e: PointerEvent) {
      /* En touch, `pointerover` llega junto con el tap: mostrar ahí pinta un tooltip que
         tapa justo lo que la persona acaba de tocar. El touch no tiene hover. */
      if (e.pointerType === "touch") return;
      const el = candidato(e.target);
      if (el === activoRef.current) return;
      if (!el) {
        // El puntero se fue a otra parte: es el momento de saldar el préstamo.
        soltar();
        return;
      }
      mostrar(el, false);
    }

    function onFocusIn(e: FocusEvent) {
      const el = candidato(e.target);
      if (!el) {
        soltar();
        return;
      }
      // Llegar por teclado es una intención explícita: sin retraso.
      mostrar(el, true);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") ocultar();
    }

    function onScroll() {
      // Las coordenadas están congeladas: un scroll lo dejaría flotando lejos del trigger.
      if (activoRef.current) ocultar();
    }

    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerdown", ocultar, true);
    document.addEventListener("focusin", onFocusIn, true);
    // Al irse el foco el elemento queda atrás: se salda. Con el scroll y el click NO, que
    // cierran con el cursor todavía encima (ver `soltar`).
    document.addEventListener("focusout", soltar, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("blur", ocultar);
    return () => {
      cancelarTimer();
      // Si la capa se desmonta con un `title` prestado, ese nodo queda distinto de lo que
      // React renderiza para siempre. Se devuelve antes de soltar los listeners.
      fijarPrestado(null);
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("pointerdown", ocultar, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", soltar, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("blur", ocultar);
    };
  }, []);

  /* Se posiciona DESPUÉS de medir, no antes: el ancho depende del texto, y colocarlo con un
     ancho adivinado y corregirlo después es el parpadeo clásico. Nace `visibility:hidden`. */
  useLayoutEffect(() => {
    const nodo = nodoRef.current;
    if (!anclaje || !nodo) return;
    const t = nodo.getBoundingClientRect();
    const r = anclaje.rect;

    const lado: Lado = r.top - t.height - MARGEN >= BORDE ? "top" : "bottom";
    const y = lado === "top" ? r.top - t.height - MARGEN : r.bottom + MARGEN;
    const centro = r.left + r.width / 2;
    const x = Math.min(
      Math.max(BORDE, centro - t.width / 2),
      Math.max(BORDE, window.innerWidth - t.width - BORDE),
    );

    nodo.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    nodo.style.visibility = "visible";

    const flecha = flechaRef.current;
    if (flecha) {
      // La flecha apunta al CENTRO del trigger aunque el globo se haya corrido para no
      // salirse de la ventana. Sin esto, un tooltip clampeado apunta a cualquier lado.
      flecha.style.left = `${Math.round(Math.min(Math.max(centro - x, 12), Math.max(12, t.width - 12)))}px`;
      if (lado === "top") {
        flecha.style.top = "";
        flecha.style.bottom = "-4px";
        flecha.style.borderTop = "none";
        flecha.style.borderLeft = "none";
        flecha.style.borderBottom = "";
        flecha.style.borderRight = "";
      } else {
        flecha.style.bottom = "";
        flecha.style.top = "-4px";
        flecha.style.borderBottom = "none";
        flecha.style.borderRight = "none";
        flecha.style.borderTop = "";
        flecha.style.borderLeft = "";
      }
    }
  }, [anclaje]);

  if (!montado || !anclaje) return null;

  return createPortal(
    <div
      ref={nodoRef}
      role="tooltip"
      // `pointer-events-none`: el tooltip nunca puede robarle el hover al elemento que lo
      // abrió — si lo hiciera, se cerraría solo apenas se pinta encima.
      className={cn(
        "pointer-events-none fixed left-0 top-0 z-[110]",
        "max-w-[300px] rounded-lg border border-line bg-surface px-2.5 py-1.5",
        "text-xs leading-snug text-fg-secondary shadow-lg whitespace-pre-line",
      )}
      style={{ visibility: "hidden" }}
    >
      {anclaje.texto}
      <span
        ref={flechaRef}
        aria-hidden
        className="absolute -ml-1 h-2 w-2 rotate-45 border border-line bg-surface"
      />
    </div>,
    document.body,
  );
}

/**
 * El (i) de ayuda — el gesto estándar para "este rótulo no alcanza a explicar qué pasa acá".
 *
 * Vivía suelto adentro de `Table.tsx` como `HeaderHint`; se extrajo cuando apareció el
 * segundo lugar que lo necesitaba. El tooltip lo dibuja `TooltipLayer` (este componente
 * solo escribe el `title`), así que los dos no pueden divergir.
 */
export function InfoHint({ text, className }: { text: string; className?: string }) {
  return (
    <span
      tabIndex={0}
      title={text}
      aria-label={text}
      className={cn(
        "inline-flex text-fg-muted hover:text-fg-secondary focus:text-fg-secondary cursor-help outline-none",
        className,
      )}
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <circle cx="12" cy="12" r="9" strokeWidth={2} />
        <path strokeLinecap="round" strokeWidth={2} d="M12 11v5" />
        <circle cx="12" cy="8" r="0.75" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}
