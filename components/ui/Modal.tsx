"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

// ── Tamaños ────────────────────────────────────────────────────────────────────

const SIZE = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
} as const;

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  size?: keyof typeof SIZE;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  /** z-index del overlay (clase Tailwind). Subir cuando el modal se abre DESDE otra capa
   *  alta (ej. un drawer en z-[60]) para que no quede debajo. Default: z-50. */
  z?: string;
}

// ── Componente ─────────────────────────────────────────────────────────────────

/**
 * Modal genérico — overlay con portal, cierre por Escape/backdrop, lock de scroll
 * y focus trap básico. Reemplaza los overlays `fixed inset-0` hechos a mano.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  size = "md",
  children,
  footer,
  closeOnBackdrop = true,
  closeOnEscape = true,
  z = "z-50",
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);

  // Evita mismatch de hidratación: el portal solo se monta en cliente. El setState-en-effect
  // es el patrón canónico de "mount guard" SSR-safe (server→null, cliente→portal tras montar).
  // eslint-disable-next-line react-hooks/set-state-in-effect -- mount guard intencional (portal SSR)
  useEffect(() => setMounted(true), []);

  // Cierre por tecla Escape
  useEffect(() => {
    if (!open || !closeOnEscape) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, closeOnEscape, onClose]);

  // Lock de scroll del body mientras está abierto
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Focus trap básico — enfocar el panel al abrir, restaurar al cerrar
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement;
    const first = panelRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    (first ?? panelRef.current)?.focus();
    return () => previouslyFocused.current?.focus();
  }, [open]);

  if (!open || !mounted) return null;

  const hasHeader = !!(title || description);

  return createPortal(
    <div
      className={cn("fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm", z)}
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
      // El modal usa portal: sin esto, los clicks internos burbujean por el árbol
      // de React hasta el ancestro que lo renderizó (ej. una fila de tabla clickeable).
      onClick={(e) => e.stopPropagation()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "w-full bg-surface border border-line rounded-2xl shadow-2xl flex flex-col max-h-[85vh] focus:outline-none",
          SIZE[size]
        )}
      >
        {hasHeader && (
          <div className="px-5 pt-5 pb-3 flex-shrink-0">
            {title && <h2 className="text-base font-semibold text-fg">{title}</h2>}
            {description && <p className="text-sm text-fg-muted mt-1">{description}</p>}
          </div>
        )}

        <div className={cn("px-5 overflow-y-auto flex-1", hasHeader ? "pb-5" : "py-5")}>
          {children}
        </div>

        {footer && (
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-line flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
