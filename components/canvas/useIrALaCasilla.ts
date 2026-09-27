"use client";

/**
 * components/canvas/useIrALaCasilla.ts — «SIGUIENTE NÚMERO» CENTRA SU CASILLA Y LE DA EL FOCO, UNA VEZ POR PEDIDO
 * (revisión de L1–L7, #3, 2026-09-26).
 *
 * El Gantt recibe el pedido como un `nonce` (cada clic en «Siguiente número» lo sube) y el selector de la casilla. Hasta
 * la revisión, un efecto con `[nonce, selector]` de dependencias centraba y enfocaba cada vez que cambiaban. En la vista
 * «antes» el Gantt no recibe la propuesta y los dos pasan a null; al volver, recuperan el nonce viejo y el efecto corría
 * otra vez: la página saltaba a la última casilla visitada (pisando la fila que el CSE estaba mirando, que el hook deja en
 * su lugar al alternar) y le robaba el foco. Lo mismo al llegar otra propuesta en la misma pantalla.
 *
 * Ahora el último nonce ATENDIDO vive en una ref, que sobrevive al cambio de vista: el mismo nonce no se atiende dos
 * veces. Se anota dentro del frame (no al correr el efecto): si el efecto se limpia antes del frame (el doble montaje de
 * desarrollo), el pedido no se pierde.
 */
import { useEffect, useRef } from "react";

export function useIrALaCasilla(nonce: number | null, selector: string | null): void {
  const atendido = useRef<number | null>(null);
  useEffect(() => {
    if (nonce === null || selector === null || nonce === atendido.current) return;
    const frame = requestAnimationFrame(() => {
      atendido.current = nonce;
      const el = document.querySelector<HTMLElement>(selector);
      if (!el) return;
      el.scrollIntoView({ block: "center" });
      el.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [nonce, selector]);
}
