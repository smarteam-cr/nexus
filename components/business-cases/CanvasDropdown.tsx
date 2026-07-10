"use client";

import { useState, useEffect, useRef } from "react";
import { ConfirmDialog } from "@/components/ui";
import type { VersionMeta } from "@/components/business-cases/bc-workspace-shared";

// ── Dropdown del canvas (Plantilla v0 + "Caso de uso N" con borrar) ────────────
export default function CanvasDropdown({
  versions,
  canvasId,
  onSwitch,
  onDelete,
}: {
  versions: VersionMeta[];
  canvasId: string;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const active = versions.find((v) => v.canvasId === canvasId);
  const confirmTarget = versions.find((v) => v.canvasId === confirmId);
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-xl font-bold text-fg hover:text-fg-secondary transition-colors"
      >
        {active?.name ?? "Caso de uso"}
        <svg className={`w-4 h-4 text-fg-muted transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && versions.length > 0 && (
        <div className="absolute left-0 top-full mt-1 z-50 w-64 bg-surface border border-line rounded-xl shadow-xl py-1">
          {versions.map((v) => (
            <div
              key={v.canvasId}
              className={`flex items-center gap-1 ${v.canvasId === canvasId ? "bg-brand/10" : "hover:bg-surface-hover"}`}
            >
              <button
                onClick={() => { onSwitch(v.canvasId); setOpen(false); }}
                className={`flex-1 text-left px-4 py-2 text-sm transition-colors ${
                  v.canvasId === canvasId ? "text-brand font-semibold" : "text-fg-secondary"
                }`}
              >
                {v.name}{v.isActive ? " · activo" : ""}
              </button>
              {/* La Plantilla (v0) no se borra; los casos de uso sí. */}
              {v.version >= 1 && (
                <button
                  onClick={() => setConfirmId(v.canvasId)}
                  title="Borrar caso de uso"
                  aria-label={`Borrar el caso de uso ${v.name}`}
                  className="flex-shrink-0 p-1.5 mr-1 rounded-md text-fg-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={!!confirmId}
        onConfirm={async () => {
          if (confirmId) await onDelete(confirmId);
          setConfirmId(null);
          setOpen(false);
        }}
        onCancel={() => setConfirmId(null)}
        title="¿Borrar este caso de uso?"
        description={
          confirmTarget
            ? `Se eliminará "${confirmTarget.name}" con todo su contenido. No afecta la Plantilla ni los otros casos.`
            : ""
        }
        confirmLabel="Borrar"
      />
    </div>
  );
}
