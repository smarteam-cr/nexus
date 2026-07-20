"use client";

/**
 * components/ai/DocumentAssist.tsx — el CTA COMPLETO del assist de documento
 * para los documentos sobre CanvasBlock (kickoff, business case, desarrollo):
 * botón "✨ Mejorar con IA" + AssistDialog + propuesta en <AgentProposal> con
 * checkbox por sección y "Fuentes consultadas". El caller SOLO define de dónde
 * viene la propuesta (`url` + `extraBody`) y cómo se aplica una sección
 * (`onApplySection` — típicamente `hook.upsertCardData`, que ya trae optimismo,
 * undo por bloque y pendingWrites).
 *
 * Roles tiene su propio montaje en RoleWorkspace (mismo diálogo y mismo
 * AgentProposal, pero su apply mapea el hero a METADATOS y pasa por el autosave
 * — no por upsertCardData). Doctrina: DECISIONS §Roles.
 */
import { useState } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import AssistDialog from "@/components/ai/AssistDialog";
import { AgentProposal } from "@/components/ai/AgentProposal";

/** Respuesta de los endpoints .../assist (espejo de DocumentAssistResult). */
export interface DocAssistResult {
  proposal: Record<string, unknown>;
  summary: string[];
  reasoning?: string;
  warnings: string[];
  citations: { url: string; title: string }[];
  usedWebSearch: boolean;
}

export default function DocumentAssist({
  url,
  extraBody,
  dialogTitle,
  chips,
  placeholder,
  labelFor,
  onApplySection,
  onApplied,
  className,
}: {
  /** Endpoint POST del assist (ej. `/api/projects/${projectId}/canvas-assist`). */
  url: string;
  /** Body extra junto a la instrucción (ej. { canvasId }). */
  extraBody?: Record<string, unknown>;
  dialogTitle: string;
  chips: string[];
  placeholder?: string;
  /** Label humano de una key de sección (de las defs del documento). */
  labelFor: (key: string) => string;
  /** Aplica UNA sección seleccionada (ej. upsertCardData del hook del canvas). */
  onApplySection: (key: string, data: unknown) => Promise<void> | void;
  /** Tras aplicar todo (ej. refetch/marcar dirty). */
  onApplied?: () => void;
  className?: string;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DocAssistResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  const submit = async (instruction: string) => {
    setLoading(true);
    try {
      const r = await fetchJson<DocAssistResult>(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction, ...extraBody }),
      });
      setResult(r);
      setSelected(new Set(Object.keys(r.proposal)));
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "El assist falló. Prueba de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    if (!result) return;
    setApplying(true);
    try {
      for (const key of selected) {
        const data = result.proposal[key];
        if (data !== undefined) await onApplySection(key, data);
      }
      setResult(null);
      onApplied?.();
      toast.success("Propuesta aplicada.");
    } catch {
      toast.error("No se pudo aplicar la propuesta completa. Revisa las secciones.");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className={className}>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={loading}
          className="px-3 py-1.5 text-sm font-medium rounded-lg border border-line text-fg-secondary hover:border-brand hover:text-brand transition-colors disabled:opacity-50"
        >
          ✨ Mejorar con IA
        </button>
      </div>

      <AssistDialog
        open={open}
        onClose={() => setOpen(false)}
        title={dialogTitle}
        chips={chips}
        placeholder={placeholder}
        loading={loading}
        onSubmit={submit}
      />

      {result && (
        <AgentProposal
          title="Propuesta de la IA"
          subtitle="Revisa las secciones propuestas y elige cuáles aplicar. Nada se guarda hasta que apliques."
          summary={result.summary}
          reasoning={result.reasoning}
          warnings={result.warnings}
          onApply={apply}
          onDiscard={() => setResult(null)}
          applying={applying}
          applyDisabled={selected.size === 0}
          className="mt-3"
        >
          <div className="space-y-1.5">
            {Object.keys(result.proposal).map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm text-fg-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.has(key)}
                  onChange={(e) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(key);
                      else next.delete(key);
                      return next;
                    })
                  }
                  className="accent-brand"
                />
                {labelFor(key)}
              </label>
            ))}
          </div>
          {result.citations.length > 0 && (
            <div className="pt-1">
              <p className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider mb-1">
                Fuentes consultadas
              </p>
              <ul className="space-y-0.5">
                {result.citations.map((c) => (
                  <li key={c.url}>
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-brand hover:underline break-all"
                    >
                      {c.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </AgentProposal>
      )}
    </div>
  );
}
