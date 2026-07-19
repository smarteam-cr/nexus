"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { Modal } from "./Modal";
import { Button } from "./Button";

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface ConfirmDialogProps {
  open: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  title?: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "default";
  /** Si se omite, el diálogo gestiona el estado de carga cuando onConfirm es async. */
  loading?: boolean;
  /** z-index del overlay (Tailwind). Subir si se abre desde una capa alta (ej. drawer z-[60]). */
  z?: string;
}

// ── Componente ─────────────────────────────────────────────────────────────────

/**
 * Diálogo de confirmación — wrapper fino sobre Modal. Reemplaza las múltiples
 * UIs de eliminar (window.confirm, overlays, footers animados, etc.).
 */
export function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title = "¿Confirmar acción?",
  description,
  confirmLabel = "Eliminar",
  cancelLabel = "Cancelar",
  variant = "destructive",
  loading: loadingProp,
  z,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const loading = loadingProp ?? busy;

  async function handleConfirm() {
    const result = onConfirm();
    if (result instanceof Promise) {
      setBusy(true);
      try {
        await result;
      } finally {
        setBusy(false);
      }
    }
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="sm"
      closeOnBackdrop={!loading}
      closeOnEscape={!loading}
      z={z}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0",
            variant === "destructive" ? "bg-red-500/10" : "bg-brand/10"
          )}
        >
          <svg
            className={cn(
              "w-4 h-4",
              variant === "destructive" ? "text-red-400" : "text-brand-light"
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <div className="min-w-0 pt-0.5">
          <p className="text-sm font-medium text-fg">{title}</p>
          {description && (
            <p className="text-xs text-fg-muted mt-1 leading-relaxed">{description}</p>
          )}
        </div>
      </div>

      <div className="flex gap-2 mt-5">
        <Button
          variant={variant === "destructive" ? "destructive-solid" : "primary"}
          size="md"
          className="flex-1"
          loading={loading}
          onClick={handleConfirm}
        >
          {confirmLabel}
        </Button>
        <Button
          variant="secondary"
          size="md"
          className="flex-1"
          disabled={loading}
          onClick={onCancel}
        >
          {cancelLabel}
        </Button>
      </div>
    </Modal>
  );
}
