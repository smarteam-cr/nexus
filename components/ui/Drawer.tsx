"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

// ── Tamaños ────────────────────────────────────────────────────────────────────

const WIDTH = {
  sm: "w-[380px]",
  md: "w-[440px]",
  lg: "w-[560px]",
  // Mitad de la pantalla (full-width en mobile; nunca más angosto que lg).
  xl: "w-full sm:w-[50vw] sm:min-w-[560px]",
} as const;

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  size?: keyof typeof WIDTH;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
}

// ── Componente ─────────────────────────────────────────────────────────────────

/**
 * Panel lateral derecho genérico — mismo patrón que Modal.tsx (portal, mount
 * guard SSR-safe, Escape/backdrop, lock de scroll, focus trap básico) pero
 * desliza desde la derecha en vez de centrarse. Pensado para formularios de
 * "crear/editar" que no deben aparecer siempre-visibles en la página (el CTA
 * los abre) — ver components/marketing/*Client.tsx.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  size = "md",
  children,
  footer,
  closeOnBackdrop = true,
  closeOnEscape = true,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- mount guard intencional (portal SSR)
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open || !closeOnEscape) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, closeOnEscape, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement;
    const first = panelRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    (first ?? panelRef.current)?.focus();
    return () => previouslyFocused.current?.focus();
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-50 bg-black/30"
        onMouseDown={() => closeOnBackdrop && onClose()}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "fixed right-0 top-0 h-full z-[51] bg-surface border-l border-line shadow-2xl flex flex-col animate-in slide-in-from-right duration-200 focus:outline-none",
          WIDTH[size],
        )}
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-line flex-shrink-0">
            <div className="min-w-0">
              {title && <h2 className="text-sm font-semibold text-fg">{title}</h2>}
              {description && <p className="mt-0.5 text-xs text-fg-muted">{description}</p>}
            </div>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-fg-muted hover:text-fg hover:bg-surface-hover"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-line flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}
