"use client";

/**
 * components/marketing/useMarketingEngine.ts
 *
 * Estado + acciones del motor de Contenido (correr corridas, pollear progreso,
 * cargar stats/fuentes/historial). Compartido entre la página Contenido
 * (detalle completo) y la barra compacta de Ideas (landing) — evita duplicar
 * la lógica de polling/notificación en dos componentes.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { pollMarketingRun, type PolledMarketingRun } from "@/lib/marketing/poll-run";
import { maybeRequestPermission, notifyAgentDone } from "@/lib/notifications/client";

export type RunKind = "INGEST" | "GENERATE" | "CHAIN";

export interface RunRow {
  id: string;
  kind: RunKind;
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
export interface SourceStat {
  id: string;
  label: string;
  active: boolean;
  posts: number;
  lastFetchedAt: string | null;
  lastFetchError: string | null;
}
export interface PostsStats {
  total: number;
  inWindow: number;
}

/** Etiqueta del botón/historial por tipo de corrida. */
export const RUN_KIND_LABEL: Record<RunKind, string> = {
  CHAIN: "Generar ideas nuevas",
  GENERATE: "Regenerar con lo guardado",
  INGEST: "Solo actualizar fuentes",
};

export function useMarketingEngine() {
  const toast = useToast();
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [stats, setStats] = useState<PostsStats | null>(null);
  const [sources, setSources] = useState<SourceStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [runningPhase, setRunningPhase] = useState<string | null>(null);
  const busyRef = useRef(false);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

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
      if (runsRes.activeRunId && !busyRef.current) {
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
        if (finished.contentIdeasCount != null) parts.push(`${finished.contentIdeasCount} idea(s) nuevas`);
        if (finished.campaignIdeasCount) parts.push(`${finished.campaignIdeasCount} campaña(s)`);
        if (finished.newPostsCount != null) parts.push(`${finished.newPostsCount} post(s) nuevos`);
        if (finished.sourcesErrorCount) parts.push(`${finished.sourcesErrorCount} fuente(s) con error`);
        // La cadena SIEMPRE genera — si no hubo inspiración nueva esta corrida,
        // avisamos que igual se generó con lo guardado (no es un error).
        const noFreshInspiration =
          finished.kind === "CHAIN" && finished.newPostsCount === 0 && finished.contentIdeasCount != null;
        toast.success(
          noFreshInspiration
            ? `Listo — sin inspiración nueva esta semana, se generó con lo guardado (${parts.join(" · ")}).`
            : `Listo — ${parts.join(" · ") || "corrida completada"}.`,
        );
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

  const startRun = useCallback(
    async (kind: RunKind) => {
      if (busyRef.current) return;
      maybeRequestPermission();
      setBusy(true);
      try {
        const d = await fetchJson<{ runId: string }>("/api/marketing/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind }),
        });
        toast.info(`${RUN_KIND_LABEL[kind]}…`);
        await attachToRun(d.runId);
      } catch (e) {
        setBusy(false);
        toast.error(e instanceof ApiError ? e.message : "No se pudo disparar la corrida.");
      }
    },
    [toast, attachToRun],
  );

  return {
    runs,
    stats,
    sources,
    loading,
    busy,
    runningPhase,
    startRun,
    lastRun: runs[0] ?? null,
    reload: load,
  };
}
