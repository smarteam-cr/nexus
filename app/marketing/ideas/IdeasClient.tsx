"use client";

/**
 * Ideas de contenido generadas — PÁGINA DE ATERRIZAJE del módulo (el equipo de
 * Marketing llega acá el lunes). Salida NO-CRUD: se revisan y se PODAN (borrar
 * las que no sirven). Las buenas se migran a HubSpot a mano, campo por campo.
 *
 * Incluye arriba la barra del motor (CTA "Generar ideas nuevas" + estado de la
 * última corrida) para no depender de navegar a la pestaña Contenido.
 */
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog, EmptyState, Badge } from "@/components/ui";
import { useMarketingEngine } from "@/components/marketing/useMarketingEngine";

interface IdeaRow {
  id: string;
  title: string;
  copy: string;
  imageConcept: string;
  suggestedPillarName: string | null;
  pillar: { id: string; name: string } | null;
  sources: Array<{
    post: { id: string; url: string | null; authorName: string | null; text: string };
  }>;
  createdAt: string;
}
interface PillarOption {
  id: string;
  name: string;
}

export default function IdeasClient({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const [ideas, setIdeas] = useState<IdeaRow[]>([]);
  const [pillars, setPillars] = useState<PillarOption[]>([]);
  const [pillarFilter, setPillarFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const engine = useMarketingEngine();

  const load = useCallback(async () => {
    try {
      const qs = pillarFilter ? `?pillarId=${encodeURIComponent(pillarFilter)}` : "";
      const [ideasRes, pillarsRes] = await Promise.all([
        fetchJson<{ ideas: IdeaRow[] }>(`/api/marketing/ideas${qs}`),
        fetchJson<{ pillars: PillarOption[] }>("/api/marketing/pillars"),
      ]);
      setIdeas(ideasRes.ideas);
      setPillars(pillarsRes.pillars);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudieron cargar las ideas.");
    } finally {
      setLoading(false);
    }
  }, [toast, pillarFilter]);
  useEffect(() => {
    load();
  }, [load]);

  // Cuando el motor termina una corrida disparada desde esta página, refrescar
  // la lista de ideas también (además del propio estado interno del hook).
  const engineBusy = engine.busy;
  useEffect(() => {
    if (!engineBusy) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineBusy]);

  const remove = async (id: string) => {
    try {
      await fetchJson(`/api/marketing/ideas/${id}`, { method: "DELETE" });
      toast.info("Idea podada.");
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo borrar.");
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copiado al portapapeles.");
    } catch {
      toast.error("No se pudo copiar.");
    }
  };

  const lastRun = engine.lastRun;

  return (
    <div className="space-y-4">
      {/* Barra del motor: CTA principal + estado, siempre visible arriba */}
      <div className="rounded-2xl border border-line bg-surface p-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-medium text-fg">
            {engine.loading
              ? "Cargando estado del motor…"
              : lastRun
                ? `Última corrida: ${new Date(lastRun.createdAt).toLocaleString("es-CR", { dateStyle: "short", timeStyle: "short" })}${
                    lastRun.status === "DONE" && lastRun.contentIdeasCount != null
                      ? ` · ${lastRun.contentIdeasCount} idea(s) generadas`
                      : lastRun.status === "ERROR"
                        ? " · falló"
                        : lastRun.status === "RUNNING"
                          ? " · en curso"
                          : ""
                  }`
                : "Todavía no corriste el motor."}
          </p>
          <Link href="/marketing/contenido" className="text-xs text-brand hover:underline">
            Ver detalle del motor →
          </Link>
        </div>
        {canEdit && (
          <button
            onClick={() => engine.startRun("CHAIN")}
            disabled={engine.busy}
            className="flex-shrink-0 px-4 py-2 text-sm rounded-lg bg-brand text-white disabled:opacity-40 hover:opacity-90"
          >
            {engine.busy ? (engine.runningPhase ?? "En curso…") : "Generar ideas nuevas"}
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-fg-muted">
          Revisá y <span className="font-medium text-fg-secondary">borrá las que no sirven</span>.
          Las buenas se migran a HubSpot copiando campo por campo.
        </p>
        <select
          value={pillarFilter}
          onChange={(e) => setPillarFilter(e.target.value)}
          className="px-3 py-1.5 text-xs bg-surface border border-line rounded-lg text-fg"
        >
          <option value="">Todos los pilares</option>
          {pillars.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-fg-muted">Cargando…</p>
      ) : ideas.length === 0 ? (
        <EmptyState
          variant="dashed"
          title="Todavía no hay ideas"
          description="Generá la primera tanda con el botón de arriba."
        />
      ) : (
        <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {ideas.map((idea) => {
            const expanded = expandedId === idea.id;
            return (
              <li key={idea.id} className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-fg leading-snug">{idea.title}</p>
                  {canEdit && (
                    <button
                      onClick={() => setConfirmDeleteId(idea.id)}
                      title="Podar (borrar) esta idea"
                      className="flex-shrink-0 text-xs text-red-400 hover:text-red-300"
                    >
                      Borrar
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {idea.pillar ? (
                    <Badge size="xs">{idea.pillar.name}</Badge>
                  ) : idea.suggestedPillarName ? (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/30">
                      Pilar sugerido: {idea.suggestedPillarName}
                    </span>
                  ) : (
                    <span className="text-[11px] text-fg-muted">Sin pilar</span>
                  )}
                  <span className="text-[11px] text-fg-muted">
                    {new Date(idea.createdAt).toLocaleDateString("es-CR")}
                  </span>
                </div>

                <div className={`text-xs text-fg-secondary whitespace-pre-wrap leading-relaxed ${expanded ? "" : "line-clamp-4"}`}>
                  {idea.copy}
                </div>
                <button
                  onClick={() => setExpandedId(expanded ? null : idea.id)}
                  className="self-start text-xs text-brand hover:underline"
                >
                  {expanded ? "Ver menos" : "Ver copy completo"}
                </button>

                {expanded && (
                  <>
                    <div className="rounded-xl border border-line bg-surface-muted px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted mb-1">
                        Concepto de imagen
                      </p>
                      <p className="text-xs text-fg-secondary whitespace-pre-wrap">{idea.imageConcept}</p>
                    </div>
                    {idea.sources.length > 0 && (
                      <div className="text-[11px] text-fg-muted">
                        Inspirado en:{" "}
                        {idea.sources.map((s, i) => (
                          <span key={s.post.id}>
                            {i > 0 && " · "}
                            {s.post.url ? (
                              <a
                                href={s.post.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-brand hover:underline"
                              >
                                {s.post.authorName ?? "post"}
                              </a>
                            ) : (
                              <span title={s.post.text.slice(0, 200)}>{s.post.authorName ?? "post"}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => copyToClipboard(idea.copy)}
                        className="px-3 py-1.5 text-xs rounded-lg border border-line text-fg-secondary hover:bg-surface-hover"
                      >
                        Copiar copy
                      </button>
                      <button
                        onClick={() => copyToClipboard(idea.imageConcept)}
                        className="px-3 py-1.5 text-xs rounded-lg border border-line text-fg-secondary hover:bg-surface-hover"
                      >
                        Copiar concepto de imagen
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={async () => {
          const id = confirmDeleteId;
          setConfirmDeleteId(null);
          if (id) await remove(id);
        }}
        title="¿Podar esta idea?"
        description="Se borra definitivamente. Esta acción no se puede deshacer."
        confirmLabel="Borrar"
      />
    </div>
  );
}
