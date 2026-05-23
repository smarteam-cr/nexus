"use client";

import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Note {
  id: string | number;
  content: string;
  metadata: Record<string, unknown> | null;
}

interface Props {
  clientId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function truncate(text: string, maxWords = 40): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ") + "…";
}

/** Extrae una fecha legible del campo metadata si existe */
function metaDate(metadata: Record<string, unknown> | null): string {
  if (!metadata) return "";
  const raw =
    metadata.date ??
    metadata.timestamp ??
    metadata.created_at ??
    metadata.hs_timestamp;
  if (!raw) return "";
  const d = new Date(String(raw));
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ClientDataLakeFindings({ clientId }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string | number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/clients/${clientId}/data-lake`)
      .then(async (res) => {
        if (!res.ok) throw new Error("api_error");
        const data = await res.json();
        if (cancelled) return;
        if (data.error) setError(data.detail ?? data.error);
        else setNotes(data.notes ?? []);
      })
      .catch(() => { if (!cancelled) setError("network_error"); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [clientId]);

  // Silencioso si no hay datos ni cargando
  if (!loading && notes.length === 0) return null;
  if (loading && notes.length === 0) return <FindingsSkeleton />;
  if (error) return null;

  return (
    <div className="mb-5">
      {/* ── Header ── */}
      <div className="flex items-center gap-1.5 mb-2.5">
        <svg
          className="w-3.5 h-3.5 text-blue-400/60"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <span className="text-2xs font-semibold text-gray-500 uppercase tracking-wider">
          Notas HubSpot
        </span>
        <span className="text-2xs text-gray-700 ml-0.5">({notes.length})</span>
      </div>

      {/* ── Grid de cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
        {notes.map((note) => {
          const isExpanded = expanded.has(note.id);
          const content = String(note.content ?? "");
          const words = content.trim().split(/\s+/);
          const isLong = words.length > 40;
          const dateStr = metaDate(note.metadata);

          return (
            <div
              key={note.id}
              className="rounded-xl bg-white border border-gray-100 shadow-sm px-4 py-3 flex flex-col gap-1.5 hover:border-blue-200 transition-colors"
            >
              {/* Fecha desde metadata */}
              {dateStr && (
                <p className="text-2xs text-gray-400 leading-none">{dateStr}</p>
              )}

              {/* Contenido */}
              <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
                {isExpanded ? content : truncate(content, 40)}
              </p>

              {/* Ver más / menos */}
              {isLong && (
                <button
                  onClick={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (isExpanded) next.delete(note.id);
                      else next.add(note.id);
                      return next;
                    })
                  }
                  className="self-start text-2xs text-blue-400 hover:text-blue-500 font-medium mt-0.5"
                >
                  {isExpanded ? "Ver menos ↑" : "Ver más ↓"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function FindingsSkeleton() {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-1.5 mb-2.5">
        <Skeleton className="w-24 h-2.5" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl bg-gray-900 border border-gray-800 px-4 py-3 space-y-2"
          >
            <Skeleton className="h-2 w-1/3" delay={i * 60} />
            <Skeleton className="h-2 w-full" delay={i * 60} />
            <Skeleton className="h-2 w-4/5" delay={i * 60} />
            <Skeleton className="h-2 w-3/5" delay={i * 60} />
          </div>
        ))}
      </div>
    </div>
  );
}
