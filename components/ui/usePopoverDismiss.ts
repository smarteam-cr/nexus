"use client";

/**
 * usePopoverDismiss — cerrar un popover por clic afuera o Esc, SIN perder lo que se estaba
 * editando adentro.
 *
 * ── LA PARTE QUE NO ES OBVIA ─────────────────────────────────────────────────
 * Cerrar el popover DESMONTA sus controles, y un control que se desmonta **no dispara
 * `blur`** — que es justo donde comitean `Editable`, `PopInput` y `ScaleSlider`. Sin el
 * `blur()` explícito ANTES de cerrar, editar un campo y cerrar con un clic afuera pierde
 * el valor EN SILENCIO. Ya pasó una vez con el enlace del CTA (components/landing/sections.tsx).
 *
 * Por eso el blur va primero: el commit corre sincrónicamente y recién después se desmonta.
 *
 * Vive acá y no copiado en cada popover porque es exactamente el tipo de detalle que se
 * arregla en un lugar y se olvida en el otro.
 */
import { useEffect, type RefObject } from "react";

export function usePopoverDismiss(
  open: boolean,
  close: () => void,
  ref: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const commitFocused = () => {
      const el = document.activeElement;
      if (el instanceof HTMLElement && ref.current?.contains(el)) el.blur();
    };
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        commitFocused();
        close();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        commitFocused();
        close();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, ref]);
}
