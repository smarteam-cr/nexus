"use client";

/**
 * components/feedback/Senalar.tsx — «Señalar algo»: marcar hasta 3 cosas en la pantalla.
 *
 * Mientras se señala, el panel se esconde y una capa transparente toma el mouse: lo que está debajo se
 * resalta con un borde azul y su nombre, y un clic deja una marca numerada. Las marcas quedan en la
 * página (posición absoluta, se mueven con el scroll) y SALEN en la captura: así se ve qué se señaló.
 * Cada marca guarda también el nombre de lo que tocó («Botón «Guardar»», «Etapa de …»), que es lo que
 * lee quien revisa aunque la captura no sirva.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MAX_MARCAS } from "@/lib/feedback/reglas";
import { Z } from "@/lib/ui/z";
import { ATRIBUTO_FUERA_DE_LA_CAPTURA } from "./captura";
import { ICONO_SENALAR, MarcaNumerada, Trazo } from "./piezas";

export interface Marca {
  n: number;
  /** Posición en la PÁGINA (no en la ventana): la marca se mueve con el scroll. */
  x: number;
  y: number;
  descripcion: string;
}

const recortar = (t: string, max = 50) => {
  const limpio = t.replace(/\s+/g, " ").trim();
  return limpio.length > max ? `${limpio.slice(0, max - 1)}…` : limpio;
};

/** Cómo se llama lo que se tocó, en palabras: lo que lee quien revisa. */
export function describirElemento(el: Element): string {
  const h = el as HTMLElement;
  const etiqueta = h.getAttribute("aria-label") || h.getAttribute("title") || "";
  const texto = recortar(etiqueta || h.innerText || (h as HTMLInputElement).placeholder || "");
  const tag = el.tagName.toLowerCase();
  const rol = h.getAttribute("role");
  const tipo =
    tag === "button" || rol === "button"
      ? "Botón"
      : tag === "a"
        ? "Enlace"
        : tag === "input" || tag === "textarea" || tag === "select"
          ? "Campo"
          : /^h[1-6]$/.test(tag)
            ? "Título"
            : tag === "td" || tag === "th" || rol === "cell"
              ? "Celda"
              : tag === "img"
                ? "Imagen"
                : "";
  if (tipo && texto) return `${tipo} «${texto}»`;
  if (texto) return `«${texto}»`;
  return tipo || "Una parte de la pantalla";
}

/** El elemento de la página bajo el puntero, sin contar las capas de Feedback. */
function elementoDebajo(x: number, y: number): Element | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if ((el as HTMLElement).closest?.(`[${ATRIBUTO_FUERA_DE_LA_CAPTURA}]`)) continue;
    if (el === document.body || el === document.documentElement) continue;
    return el;
  }
  return null;
}

export function CapaDeSenalar({
  marcas,
  onMarcar,
  onListo,
  onCancelar,
}: {
  marcas: Marca[];
  onMarcar: (m: Marca) => void;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const [resaltado, setResaltado] = useState<{ rect: DOMRect; nombre: string } | null>(null);
  const capa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancelar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onCancelar]);

  const mover = useCallback((e: React.MouseEvent) => {
    const el = elementoDebajo(e.clientX, e.clientY);
    setResaltado(el ? { rect: el.getBoundingClientRect(), nombre: describirElemento(el) } : null);
  }, []);

  const marcar = useCallback(
    (e: React.MouseEvent) => {
      if (marcas.length >= MAX_MARCAS) return;
      const el = elementoDebajo(e.clientX, e.clientY);
      onMarcar({
        n: marcas.length + 1,
        x: e.clientX + window.scrollX,
        y: e.clientY + window.scrollY,
        descripcion: el ? describirElemento(el) : "Una parte de la pantalla",
      });
    },
    [marcas.length, onMarcar],
  );

  return createPortal(
    <>
      <div
        ref={capa}
        data-feedback-ui=""
        className="fixed inset-0 cursor-crosshair"
        style={{ zIndex: Z.POPOVER }}
        onMouseMove={mover}
        onMouseLeave={() => setResaltado(null)}
        onClick={marcar}
        aria-hidden="true"
      >
        {resaltado && (
          <div
            className="pointer-events-none absolute rounded outline outline-2 outline-offset-2 outline-brand"
            style={{ left: resaltado.rect.left, top: resaltado.rect.top, width: resaltado.rect.width, height: resaltado.rect.height }}
          >
            <span className="absolute -top-7 left-0 whitespace-nowrap rounded-md bg-primary px-2 py-[3px] text-[11px] font-semibold text-primary-fg">
              {resaltado.nombre}
            </span>
          </div>
        )}
      </div>
      <div
        data-feedback-ui=""
        role="toolbar"
        aria-label="Señalar en la pantalla"
        className="fixed left-1/2 top-4 flex w-[640px] max-w-[calc(100vw-32px)] -translate-x-1/2 flex-wrap items-center gap-3 rounded-[10px] border border-info-line bg-info-surface px-3.5 py-2.5"
        style={{ zIndex: Z.POPOVER }}
      >
        <Trazo d={ICONO_SENALAR} className="h-[18px] w-[18px] flex-shrink-0 text-brand" />
        <p className="min-w-[220px] flex-1 text-[13px] text-fg">
          <span className="font-semibold">Señalando.</span> Haz clic en lo que quieres mostrar. Puedes marcar hasta {MAX_MARCAS}; Esc para salir.
        </p>
        <span className="text-xs tabular-nums text-fg-muted">
          {marcas.length} de {MAX_MARCAS}
        </span>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-md border border-line bg-surface px-2.5 py-[5px] text-xs font-medium text-fg-secondary hover:bg-surface-hover hover:text-fg"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onListo}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg hover:bg-primary-hover"
        >
          Listo
        </button>
      </div>
    </>,
    document.body,
  );
}

/** Las marcas puestas: quedan en la página (y en la captura) mientras el panel está abierto. */
export function MarcasEnLaPagina({ marcas }: { marcas: Marca[] }) {
  const [montado, setMontado] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- mount guard del portal (SSR)
  useEffect(() => setMontado(true), []);
  if (!montado || marcas.length === 0) return null;
  return createPortal(
    <>
      {marcas.map((m) => (
        <span
          key={m.n}
          aria-hidden="true"
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface"
          style={{ left: m.x, top: m.y, zIndex: Z.STICKY }}
        >
          <MarcaNumerada n={m.n} className="h-[22px] w-[22px] text-[11px]" />
        </span>
      ))}
    </>,
    document.body,
  );
}
