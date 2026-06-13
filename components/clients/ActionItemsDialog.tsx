"use client";

/**
 * ActionItemsDialog
 *
 * Modal central de pendientes (action items) del proyecto. Es presentacional:
 * opera sobre los mismos `items` que ProjectGPS (una sola fuente de verdad, que
 * vive en el cache de GPS), así que su estado se "mantiene en memoria" al cerrar
 * el dialog o cambiar de tab. Reusa las mutaciones del padre (toggle/add/remove).
 */
import { useState } from "react";
import Link from "next/link";
import type { PendingItem } from "./ProjectGPS";

export default function ActionItemsDialog({
  open,
  onClose,
  items,
  onToggle,
  onAdd,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  items: PendingItem[];
  onToggle: (index: number) => void;
  onAdd: (text: string) => void;
  onRemove: (index: number) => void;
}) {
  const [newText, setNewText] = useState("");
  if (!open) return null;

  const pending = items.filter((i) => !i.done).length;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim()) return;
    onAdd(newText);
    setNewText("");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-surface border border-line shadow-2xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-line">
          <h2 className="text-base font-semibold text-fg">
            Pendientes{pending > 0 ? ` · ${pending} abiertos` : ""}
          </h2>
          <button onClick={onClose} title="Cerrar" className="text-fg-muted hover:text-fg text-xl leading-none">×</button>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5">
          {items.length === 0 && <p className="text-sm text-fg-muted py-6 text-center">No hay pendientes todavía.</p>}
          {items.map((item, i) => (
            <div key={item.id ?? i} className="flex items-start gap-2.5 group rounded-lg hover:bg-surface-muted px-2 py-1.5 -mx-2">
              <button
                onClick={() => onToggle(i)}
                className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                  item.done ? "bg-emerald-500 border-emerald-500" : "border-line hover:border-fg-muted"
                }`}
              >
                {item.done && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              <div className="flex-1 min-w-0">
                <span className={`text-sm block ${item.done ? "line-through text-fg-muted" : "text-fg-secondary"}`}>
                  {item.text}
                </span>
                <div className="flex items-center gap-2.5 mt-0.5 flex-wrap">
                  {item.sessionId && item.sessionTitle && (
                    <Link
                      href={`/sessions/${item.sessionId}`}
                      className="text-[10px] text-brand hover:underline truncate"
                      title={`De la reunión: ${item.sessionTitle}`}
                    >
                      ↗ {item.sessionTitle}
                    </Link>
                  )}
                  {item.ownerEmail && <span className="text-[10px] text-fg-muted">@{item.ownerEmail.split("@")[0]}</span>}
                  {item.dueDate && (
                    <span className="text-[10px] text-fg-muted">
                      vence {new Date(item.dueDate).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                    </span>
                  )}
                  {!item.sessionId && item.source && item.source !== "manual" && (
                    <span className="text-[10px] text-fg-muted truncate">↑ {item.source}</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => onRemove(i)}
                className="text-fg-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-sm flex-shrink-0"
                title="Eliminar"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Agregar */}
        <form onSubmit={submit} className="px-5 py-3 border-t border-line flex items-center gap-2">
          <input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Agregar un pendiente…"
            className="flex-1 text-sm bg-surface-muted border border-line rounded-lg px-3 py-2 text-fg placeholder-fg-muted focus:outline-none focus:border-brand"
          />
          <button
            type="submit"
            disabled={!newText.trim()}
            className="text-sm font-medium px-3.5 py-2 rounded-lg bg-brand text-white hover:bg-brand/90 transition-colors disabled:opacity-40"
          >
            Agregar
          </button>
        </form>
      </div>
    </div>
  );
}
