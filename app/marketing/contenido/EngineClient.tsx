"use client";

/**
 * El motor de Contenido: dispara corridas (cadena completa / solo ingesta /
 * regenerar con lo guardado), pollea el progreso (run.phase como copy), muestra
 * stats de posts + historial. Notifica al terminar (Service Worker local).
 */
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { Badge } from "@/components/ui";
import { pollMarketingRun, type PolledMarketingRun } from "@/lib/marketing/poll-run";
import { maybeRequestPermission, notifyAgentDone } from "@/lib/notifications/client";

interface RunRow {
  id: string;
  kind: "INGEST" | "GENERATE" | "CHAIN";
  trigger: "MANUAL" | "CRON";
  status: "RUNNING" | "DONE" | "ERROR";
  phase: string | null;
  newPostsCount: number | null;
  fetchedPostsCount: number | null;
  sourcesOkCount: number | null;
  sourcesErrorCount: number | null;
  contentIdeasCount: number | null;
  campaignIdeasCount: number | null;
  pillarSuggestionsCount: number | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}
interface SourceStat {
  id: string;
  label: string;
  active: boolean;
  posts: number;
  lastFetchedAt: string | null;
  lastFetchError: string | null;
}
interface PostsStats {
  total: number;
  inWindow: number;
}

const KIND_LABEL: Record<RunRow["kind"], string> = {
  INGEST: "Solo ingesta",
  GENERATE: "Generación (con lo guardado)",
  CHAIN: "Cadena completa",
};

export default function EngineClient({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [stats, setStats] = useState<PostsStats | null>(null);
  const [sources, setSources] = useState<SourceStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningPhase, setRunningPhase] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [runsRes, postsRes] = await Promise.all([
        fetchJson<{ runs: RunRow[]; activeRunId: string | null }>("/api/marketing/runs"),
        fetchJson<{ stats: PostsStats; sources: SourceStat[] }>("/api/marketing/posts"),
      ]);
      setRuns(runsRes.runs);
      setStats(postsRes.stats);
      setSources(postsRes.sources);
      // Si hay una corrida activa (ej. disparada por el cron), engancharse al polling.
      if (runsRes.activeRunId && !busy) {
        attachToRun(runsRes.activeRunId);
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cargar el estado.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);
  useEffect(() => {
    load();
  }, [load]);

  const attachToRun = useCallback(
    async (runId: string) => {
      setBusy(true);
      setRunningPhase("en curso…");
      const finished = await pollMarketingRun(runId, {
        onTick: (r: PolledMarketingRun) => setRunningPhase(r.phase ?? "en curso…"),
      });
      setBusy(false);
      setRunningPhase(null);

      if (finished.status === "DONE") {
        const parts: string[] = [];
        if (finished.newPostsCount != null) parts.push(`${finished.newPostsCount} post(s) nuevos`);
        if (finished.contentIdeasCount != null) parts.push(`${finished.contentIdeasCount} idea(s)`);
        if (finished.campaignIdeasCount != null) parts.push(`${finished.campaignIdeasCount} campaña(s)`);
        if (finished.sourcesErrorCount) parts.push(`${finished.sourcesErrorCount} fuente(s) con error`);
        toast.success(`Listo — ${parts.join(" · ") || "corrida completada"}.`);
        notifyAgentDone({ group: "marketing-contenido", ok: true });
      } else if (finished.status === "ERROR") {
        toast.error(finished.error ?? "La corrida falló.");
        notifyAgentDone({ group: "marketing-contenido", ok: false });
      } else {
        toast.error("La corrida sigue en curso (timeout del polling). Recargá en un rato.");
      }
      load();
    },
    [toast, load],
  );

  const startRun = async (kind: RunRow["kind"]) => {
    if (busy) return;
    maybeRequestPermission();
    setBusy(true);
    try {
      const d = await fetchJson<{ runId: string }>("/api/marketing/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      toast.info(`${KIND_LABEL[kind]} en marcha…`);
      await attachToRun(d.runId);
    } catch (e) {
      setBusy(false);
      toast.error(e instanceof ApiError ? e.message : "No se pudo disparar la corrida.");
    }
  };

  const last = runs[0] ?? null;
  const lastIngestHadNoNews =
    last?.status === "DONE" && (last.kind === "INGEST" || last.kind === "CHAIN") && last.newPostsCount === 0;

  return (
    <div className="space-y-6">
      {/* CTAs */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-fg">Correr el motor</p>
            <p className="mt-0.5 text-xs text-fg-muted">
              La cadena completa scrapea las fuentes y genera ideas. El cron la corre solo, cada viernes a las 6:00 am.
            </p>
          </div>
          {canEdit ? (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => startRun("CHAIN")}
                disabled={busy}
                className="px-4 py-2 text-sm rounded-lg bg-brand text-white disabled:opacity-40 hover:opacity-90"
              >
                {busy ? (runningPhase ?? "En curso…") : "Correr cadena completa"}
              </button>
              <button
                onClick={() => startRun("INGEST")}
                disabled={busy}
                className="px-4 py-2 text-sm rounded-lg border border-line text-fg-secondary hover:bg-surface-hover disabled:opacity-40"
              >
                Solo ingesta
              </button>
            </div>
          ) : (
            <p className="text-xs text-fg-muted">Tu rol puede ver el estado; correr el motor es del equipo de Marketing.</p>
          )}
        </div>

        {busy && runningPhase && (
          <p className="mt-3 text-xs text-brand animate-pulse">⏳ {runningPhase}</p>
        )}

        {!busy && lastIngestHadNoNews && (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-fg-secondary">
              No hay inspiración nueva esta semana (la última ingesta no trajo posts).
              {last?.kind === "CHAIN" && " La generación no corrió."}
            </p>
            {canEdit && (
              <button
                onClick={() => startRun("GENERATE")}
                disabled={busy}
                className="px-3 py-1.5 text-xs rounded-lg bg-brand text-white hover:opacity-90 disabled:opacity-40"
              >
                Regenerar con lo guardado
              </button>
            )}
          </div>
        )}

        {!busy && last?.status === "ERROR" && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
            <p className="text-xs text-red-400">Última corrida falló: {last.error}</p>
          </div>
        )}
      </div>

      {/* Stats de inspiración */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-2xl font-semibold text-fg">{loading ? "…" : (stats?.inWindow ?? 0)}</p>
          <p className="text-xs text-fg-muted">posts en ventana (últimos 3 meses) — entran a la generación</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-2xl font-semibold text-fg">{loading ? "…" : (stats?.total ?? 0)}</p>
          <p className="text-xs text-fg-muted">posts guardados en total (los &gt;3 meses quedan archivados)</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-2xl font-semibold text-fg">
            {loading ? "…" : sources.filter((s) => s.active).length}
          </p>
          <p className="text-xs text-fg-muted">
            fuentes activas ·{" "}
            <Link href="/marketing/fuentes" className="text-brand hover:underline">
              administrar
            </Link>
          </p>
        </div>
      </div>

      {/* Fuentes con error */}
      {sources.some((s) => s.active && s.lastFetchError) && (
        <div className="rounded-2xl border border-red-500/20 bg-surface p-4">
          <p className="text-xs font-semibold text-fg mb-2">Fuentes con error en la última ingesta</p>
          <ul className="space-y-1">
            {sources
              .filter((s) => s.active && s.lastFetchError)
              .map((s) => (
                <li key={s.id} className="text-xs text-fg-secondary">
                  <span className="font-medium">{s.label}</span>:{" "}
                  <span className="text-red-400">{s.lastFetchError}</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* Historial */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <p className="text-sm font-semibold text-fg mb-3">Historial de corridas</p>
        {loading ? (
          <p className="text-xs text-fg-muted">Cargando…</p>
        ) : runs.length === 0 ? (
          <p className="text-xs text-fg-muted">Todavía no hay corridas. Corré la primera con el botón de arriba.</p>
        ) : (
          <ul className="space-y-2">
            {runs.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 text-xs border-b border-line pb-2 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <span className="font-medium text-fg">{KIND_LABEL[r.kind]}</span>
                  <Badge size="xs" className="ml-2">
                    {r.trigger === "CRON" ? "Cron" : "Manual"}
                  </Badge>
                  <span className="ml-2 text-fg-muted">
                    {new Date(r.createdAt).toLocaleString("es-CR", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                  {r.status === "DONE" && (
                    <span className="ml-2 text-fg-secondary">
                      {[
                        r.newPostsCount != null ? `${r.newPostsCount} nuevos` : null,
                        r.contentIdeasCount != null ? `${r.contentIdeasCount} ideas` : null,
                        r.campaignIdeasCount != null ? `${r.campaignIdeasCount} campañas` : null,
                        r.pillarSuggestionsCount ? `${r.pillarSuggestionsCount} pilares sugeridos` : null,
                        r.sourcesErrorCount ? `${r.sourcesErrorCount} fuentes con error` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                  {r.status === "ERROR" && <span className="ml-2 text-red-400 truncate">{r.error}</span>}
                </div>
                <span
                  className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[11px] ${
                    r.status === "DONE"
                      ? "bg-emerald-500/10 text-emerald-500"
                      : r.status === "ERROR"
                        ? "bg-red-500/10 text-red-400"
                        : "bg-amber-500/10 text-amber-500"
                  }`}
                >
                  {r.status === "DONE" ? "OK" : r.status === "ERROR" ? "Error" : "En curso"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-fg-muted">
        Las salidas viven en{" "}
        <Link href="/marketing/ideas" className="text-brand hover:underline">
          Marketing → Ideas
        </Link>{" "}
        y{" "}
        <Link href="/marketing/campanas" className="text-brand hover:underline">
          Campañas
        </Link>
        . Los insumos (ICP, personas, pilares, fuentes, voz) se administran en Marketing.
      </p>
    </div>
  );
}
