"use client";

/**
 * ActionItemsDialog
 *
 * Modal central de pendientes (action items) del proyecto. Es presentacional:
 * opera sobre las listas que mantiene ProjectGPS (una sola fuente de verdad, que
 * vive en el cache de GPS), así que su estado se "mantiene en memoria" al cerrar
 * el dialog o cambiar de tab. Reusa las mutaciones del padre (toggle/add/remove).
 *
 * Dos tabs:
 *  - Pendientes: tareas abiertas (`items`). Checkbox marca hecha (→ Histórico),
 *    la X borra (soft-delete → Histórico), y el form agrega nuevas.
 *  - Histórico: tareas hechas o borradas (`history`). Las HECHAS conservan el
 *    check para des-marcarlas y devolverlas a Pendientes; las BORRADAS se
 *    muestran tachadas/atenuadas, sin acción.
 */
import { useState } from "react";
import Link from "next/link";
import type { PendingItem } from "./ProjectGPS";

function ItemMeta({ item }: { item: PendingItem }) {
  return (
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
  );
}

export default function ActionItemsDialog({
  open,
  onClose,
  items,
  history,
  onToggle,
  onAdd,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  items: PendingItem[];   // pendientes (abiertas)
  history: PendingItem[]; // hechas o borradas
  onToggle: (id: string) => void;
  onAdd: (text: string) => void;
  onRemove: (id: string) => void;
}) {
  const [newText, setNewText] = useState("");
  const [tab, setTab] = useState<"pending" | "history">("pending");
  if (!open) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim()) return;
    onAdd(newText);
    setNewText("");
  };

  const tabBtn = (active: boolean) =>
    `text-sm font-semibold px-3 py-1.5 rounded-t-lg border-b-2 transition-colors ${
      active
        ? "text-fg border-brand"
        : "text-fg-muted border-transparent hover:text-fg-secondary"
    }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-surface border border-line shadow-2xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header con tabs Pendientes / Histórico */}
        <div className="flex items-center justify-between gap-2 px-5 pt-3 border-b border-line">
          <div className="flex items-center gap-1">
            <button onClick={() => setTab("pending")} className={tabBtn(tab === "pending")}>
              Pendientes{items.length > 0 ? ` · ${items.length}` : ""}
            </button>
            <button onClick={() => setTab("history")} className={tabBtn(tab === "history")}>
              Histórico{history.length > 0 ? ` · ${history.length}` : ""}
            </button>
          </div>
          <button onClick={onClose} title="Cerrar" className="text-fg-muted hover:text-fg text-xl leading-none mb-2">×</button>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5">
          {tab === "pending" ? (
            <>
              {items.length === 0 && <p className="text-sm text-fg-muted py-6 text-center">No hay pendientes todavía.</p>}
              {items.map((item, i) => (
                <div key={item.id ?? i} className="flex items-start gap-2.5 group rounded-lg hover:bg-surface-muted px-2 py-1.5 -mx-2">
                  <button
                    onClick={() => item.id && onToggle(item.id)}
                    className="mt-0.5 w-4 h-4 rounded border border-line hover:border-fg-muted flex-shrink-0 flex items-center justify-center transition-colors"
                    title="Marcar como hecha"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm block text-fg-secondary">{item.text}</span>
                    <ItemMeta item={item} />
                  </div>
                  <button
                    onClick={() => item.id && onRemove(item.id)}
                    className="text-fg-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-sm flex-shrink-0"
                    title="Eliminar"
                  >
                    ×
                  </button>
                </div>
              ))}
            </>
          ) : (
            <>
              {history.length === 0 && <p className="text-sm text-fg-muted py-6 text-center">El histórico está vacío.</p>}
              {history.map((item, i) => {
                const isDeleted = !!item.deletedAt;
                return (
                  <div key={item.id ?? i} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 -mx-2">
                    {isDeleted ? (
                      // Borrada: sin checkbox, ícono atenuado.
                      <span
                        className="mt-0.5 w-4 h-4 rounded border border-line/60 flex-shrink-0 flex items-center justify-center text-fg-muted text-[10px]"
                        title="Tarea borrada"
                      >
                        ×
                      </span>
                    ) : (
                      // Hecha: check verde; click la des-marca y la devuelve a Pendientes.
                      <button
                        onClick={() => item.id && onToggle(item.id)}
                        className="mt-0.5 w-4 h-4 rounded border bg-emerald-500 border-emerald-500 flex-shrink-0 flex items-center justify-center transition-colors"
                        title="Des-marcar (volver a Pendientes)"
                      >
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm block line-through text-fg-muted">{item.text}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wide text-fg-muted">
                          {isDeleted ? "Borrada" : "Hecha"}
                        </span>
                        <ItemMeta item={item} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Agregar — solo en el tab Pendientes */}
        {tab === "pending" && (
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
        )}
      </div>
    </div>
  );
}
