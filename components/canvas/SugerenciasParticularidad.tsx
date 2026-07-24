"use client";

/**
 * components/canvas/SugerenciasParticularidad.tsx
 *
 * Bandeja del CSE para las particularidades SUGERIDAS por el equipo técnico desde el canvas
 * Desarrollo (`needsValidation: true`). Es el otro extremo de `SugerirParticularidad`.
 *
 * Una sugerencia NO es una desviación: no suma al corrimiento de semanas, no aparece en el
 * resumen ni sale al cliente. Recién al APROBAR se vuelve una particularidad real (la
 * partición la hace el GET del cronograma; la aprobación, `particularidades/[id]/resolve`).
 *
 * El CSE puede corregir el título, el impacto en semanas y la atribución ANTES de aprobar —
 * quien sugiere reporta el hecho, quien aprueba decide cómo entra al cronograma. La autoría de
 * quien sugirió se conserva y se muestra: es a quien hay que volver a preguntarle.
 */
import { useState } from "react";
import { Alert } from "@/components/ui/Alert";

export interface SugerenciaItem {
  id: string;
  kind: string;
  party: string;
  title: string;
  detail: string | null;
  weeksImpact: number | null;
  createdByEmail: string | null;
  occurredAt: string;
}

const KIND_LABEL: Record<string, string> = {
  ATRASO: "Atraso",
  COMPROMISO: "Compromiso",
  AVISO: "Aviso",
  SOLICITUD: "Solicitud",
};
const PARTY_LABEL: Record<string, string> = {
  CLIENTE: "Cliente",
  SMARTEAM: "Smarteam",
  AMBOS: "Ambos",
  DEV: "Desarrollo",
};

export default function SugerenciasParticularidad({
  projectId,
  sugerencias,
  onResolved,
}: {
  projectId: string;
  sugerencias: SugerenciaItem[];
  /** Se llama tras aprobar/descartar para que el contenedor recargue el cronograma. */
  onResolved: () => void | Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Ediciones del CSE antes de aprobar, por id. Sin entrada = se aprueba tal cual llegó.
  const [edits, setEdits] = useState<Record<string, { title?: string; weeksImpact?: string }>>({});

  if (sugerencias.length === 0) return null;

  const patch = (id: string, next: { title?: string; weeksImpact?: string }) =>
    setEdits((e) => ({ ...e, [id]: { ...e[id], ...next } }));

  async function resolve(s: SugerenciaItem, action: "approve" | "discard") {
    setBusyId(s.id);
    setError(null);
    try {
      const ed = edits[s.id] ?? {};
      const body: Record<string, unknown> = { action };
      if (action === "approve") {
        if (ed.title !== undefined && ed.title.trim() && ed.title.trim() !== s.title) {
          body.title = ed.title.trim();
        }
        if (ed.weeksImpact !== undefined) {
          const n = ed.weeksImpact.trim() ? Number(ed.weeksImpact.trim()) : null;
          if (n !== null && (!Number.isFinite(n) || n < 0)) {
            setError("El impacto en semanas tiene que ser un número.");
            setBusyId(null);
            return;
          }
          body.weeksImpact = n;
        }
      }
      const res = await fetch(
        `/api/projects/${projectId}/timeline/particularidades/${s.id}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(d?.error ?? "No se pudo resolver la sugerencia.");
        return;
      }
      setEdits((e) => {
        const { [s.id]: _drop, ...rest } = e;
        void _drop;
        return rest;
      });
      await onResolved();
    } catch {
      setError("Error de conexión al resolver la sugerencia.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-surface-muted px-5 py-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-surface-hover border border-line flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-fg-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.8L3 20l1.4-3.5A7.9 7.9 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg">
            {sugerencias.length === 1
              ? "1 particularidad sugerida por el equipo"
              : `${sugerencias.length} particularidades sugeridas por el equipo`}
          </p>
          <p className="text-xs text-fg-muted mt-0.5">
            Todavía no cuentan en el cronograma ni las ve el cliente. Revisá, corregí si hace falta y aprobá.
          </p>
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="space-y-3">
        {sugerencias.map((s) => {
          const ed = edits[s.id] ?? {};
          const busy = busyId === s.id;
          const title = ed.title ?? s.title;
          const weeks = ed.weeksImpact ?? (s.weeksImpact != null ? String(s.weeksImpact) : "");
          return (
            <div key={s.id} className="rounded-xl border border-line bg-surface px-4 py-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-2xs font-semibold uppercase tracking-wide text-fg-muted border border-line rounded px-1.5 py-0.5">
                  {KIND_LABEL[s.kind] ?? s.kind}
                </span>
                <span className="text-2xs font-medium text-fg-muted">
                  {PARTY_LABEL[s.party] ?? s.party}
                </span>
                <span className="text-2xs text-fg-muted ml-auto">
                  {s.createdByEmail ? `Sugerida por ${s.createdByEmail}` : "Sugerida por el equipo"}
                  {" · "}
                  {new Date(s.occurredAt).toLocaleDateString("es-CR")}
                </span>
              </div>

              <input
                value={title}
                onChange={(e) => patch(s.id, { title: e.target.value })}
                disabled={busy}
                aria-label="Título de la particularidad"
                className="w-full text-sm font-medium text-fg bg-transparent border border-line rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-brand"
              />
              {s.detail && <p className="text-[13px] leading-relaxed text-fg-secondary">{s.detail}</p>}

              <div className="flex items-center gap-3 flex-wrap pt-1">
                <label className="flex items-center gap-2 text-xs text-fg-muted">
                  Semanas de impacto
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={weeks}
                    onChange={(e) => patch(s.id, { weeksImpact: e.target.value })}
                    disabled={busy}
                    className="w-16 text-sm text-fg bg-transparent border border-line rounded-lg px-2 py-1 focus:outline-none focus:border-brand"
                  />
                </label>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => resolve(s, "discard")}
                    disabled={busy}
                    className="text-xs font-medium text-fg-muted hover:text-fg border border-line hover:bg-surface-hover rounded-lg px-3 py-1.5 disabled:opacity-50 transition-colors"
                  >
                    Descartar
                  </button>
                  <button
                    type="button"
                    onClick={() => resolve(s, "approve")}
                    disabled={busy}
                    className="text-xs font-semibold bg-primary text-primary-fg hover:bg-primary-hover disabled:opacity-50 px-3.5 py-1.5 rounded-lg transition-colors"
                  >
                    {busy ? "Guardando…" : "Aprobar"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
