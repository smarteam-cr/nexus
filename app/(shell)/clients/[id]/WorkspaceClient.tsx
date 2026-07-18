"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useWorkspace } from "@/components/clients/WorkspaceContext";
import { useToast } from "@/components/ui/Toast";
import { invalidateGps } from "@/lib/clients/gps-cache";
import ClientInfoPanel from "@/components/clients/ClientInfoPanel";
import ProjectCanvasPanel from "@/components/clients/ProjectCanvasPanel";
import ClientProcesosPanel from "@/components/clients/ClientProcesosPanel";

const STRATEGY_TAB_ID = "__strategy__";
const PROCESOS_TAB_ID = "__procesos__";

interface ProjectSummary {
  id: string;
  name: string;
  status: string;
  projectType?: string | null;
  serviceType?: string | null;
  tags?: string[];
  hubspotServiceId?: string | null;
}

// ── Main workspace component ─────────────────────────────────────────────────

export default function WorkspaceClient({
  clientId,
  projects,
  hasHubspot,
  strategyProjectId,
  strategyCanvasId,
}: {
  clientId: string;
  projects: ProjectSummary[];
  hasHubspot: boolean;
  strategyProjectId: string;
  strategyCanvasId: string;
}) {
  const router = useRouter();
  const syncedRef = useRef(false);
  const { bumpGpsRefresh } = useWorkspace();
  const toast = useToast();

  // F4 — el auto-sync de fondo deja de ser invisible: un indicador discreto mientras
  // corre, y un toast si falla. El contador maneja que los dos syncs corran en paralelo.
  const [syncing, setSyncing] = useState(false);
  const activeSyncs = useRef(0);
  // Resultado del último sync de HubSpot → para no fallar en SILENCIO: si un cliente
  // con HubSpot queda sin proyectos visibles, mostramos un banner con el motivo + Reintentar.
  const [syncResult, setSyncResult] = useState<{ created?: number; updated?: number; errors?: string[] } | null>(null);
  const [syncDone, setSyncDone] = useState(false);
  const startSync = useCallback(() => { activeSyncs.current++; setSyncing(true); }, []);
  const endSync = useCallback(() => {
    activeSyncs.current = Math.max(0, activeSyncs.current - 1);
    if (activeSyncs.current === 0) setSyncing(false);
  }, []);

  // Sincronización con HubSpot al entrar al cliente (background). Reintentable.
  const runHubspotSync = useCallback(async () => {
    startSync();
    try {
      const res = await fetch(`/api/clients/${clientId}/sync-projects`, { method: "POST" });
      if (!res.ok) throw new Error("sync failed");
      const data = await res.json();
      setSyncResult({
        created: data.created,
        updated: data.updated,
        errors: Array.isArray(data.errors) ? data.errors : [],
      });
      setSyncDone(true);
      if (data.created || data.updated) router.refresh();
    } catch {
      setSyncDone(true);
      toast.error("No se pudo sincronizar con HubSpot.", {
        action: { label: "Reintentar", onClick: () => void runHubspotSync() },
      });
    } finally {
      endSync();
    }
  }, [clientId, router, toast, startSync, endSync]);

  useEffect(() => {
    if (!hasHubspot || syncedRef.current) return;
    syncedRef.current = true;
    void runHubspotSync();
  }, [hasHubspot, runHubspotSync]);

  // Auto-sync de Google Meet en background — descubre transcripts/Docs nuevos sin que
  // el usuario dispare nada. Cooldown de 20 min en el endpoint. Si descubre cosas
  // nuevas, bumpea la señal para refrescar el GPS.
  useEffect(() => {
    startSync();
    fetch("/api/integrations/google/auto-sync", { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && !d.skipped && ((d.sync?.synced ?? 0) > 0 || (d.enrich?.enriched ?? 0) > 0)) {
          invalidateGps(); // limpia el cache → el GPS montado refetchea
          bumpGpsRefresh();
        }
      })
      // Enriquecimiento de fondo: el fallo se queda silencioso (no toda cuenta tiene
      // Google conectado). El indicador alcanza; el error ruidoso es el de HubSpot.
      .catch(() => {})
      .finally(() => endSync());
  }, [bumpGpsRefresh, startSync, endSync]);

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 57px)" }}>
      {/* Indicador discreto de sync de fondo (F4) — desaparece al terminar bien. */}
      {syncing && (
        <div
          className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-gray-700 bg-gray-900/90 px-3 py-1.5 text-[11px] font-medium text-gray-300 shadow-lg backdrop-blur"
          title="Sincronizando con HubSpot y Google en segundo plano"
        >
          <span className="w-3 h-3 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin" />
          Sincronizando…
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {/* Sync no-silencioso: cliente con HubSpot que quedó SIN proyectos visibles
            tras sincronizar → banner con el motivo + Reintentar (antes era un cliente
            vacío y mudo, imposible de diagnosticar). */}
        {hasHubspot && projects.length === 0 && syncDone && !syncing && (
          <div className="mx-6 mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-200">
                  No se cargó ningún proyecto de HubSpot para este cliente.
                </p>
                <p className="text-xs text-amber-200/80 mt-0.5">
                  {syncResult?.errors && syncResult.errors.length > 0
                    ? syncResult.errors[0]
                    : "Revisá en HubSpot que el proyecto esté asociado a la empresa de este cliente, y reintentá."}
                </p>
              </div>
              <button
                onClick={() => void runHubspotSync()}
                disabled={syncing}
                className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-100 transition-colors disabled:opacity-50"
              >
                Reintentar
              </button>
            </div>
          </div>
        )}
        <ProjectSection
          clientId={clientId}
          projects={projects}
          strategyProjectId={strategyProjectId}
          strategyCanvasId={strategyCanvasId}
        />
      </div>
    </div>
  );
}

// ── Project Section (tabs + canvas) ──────────────────────────────────────────

function ProjectSection({
  clientId,
  projects,
  strategyProjectId,
  strategyCanvasId,
}: {
  clientId: string;
  projects: ProjectSummary[];
  strategyProjectId: string;
  strategyCanvasId: string;
}) {
  const { activeProjectId, setActiveProjectId } = useWorkspace();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Persistencia del tab activo en la URL (?tab=) — el canvas ya usa ?canvas=. Así
  // al recargar se restaura el proyecto y su canvas. selectTab escribe ?tab y, si
  // se cambia de proyecto, limpia ?canvas (no arrastrar el canvas del anterior).
  const selectTab = useCallback(
    (id: string) => {
      const changingProject = id !== activeProjectId;
      setActiveProjectId(id);
      const params = new URLSearchParams(Array.from(searchParams.entries()));
      params.set("tab", id);
      if (changingProject) params.delete("canvas");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [activeProjectId, searchParams, pathname, router, setActiveProjectId],
  );

  // Al montar, restaurar el tab desde ?tab= (override del default del server en reload).
  // Una sola pasada; si no hay ?tab o es inválido, queda el default del server.
  const tabRestoredRef = useRef(false);
  useEffect(() => {
    if (tabRestoredRef.current) return;
    tabRestoredRef.current = true;
    // Leemos de window.location (no de useSearchParams): sin un <Suspense> boundary,
    // useSearchParams puede venir vacío en el primer render → el restore no dispararía.
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (!tab) return;
    const valid =
      tab === STRATEGY_TAB_ID ||
      tab === PROCESOS_TAB_ID ||
      projects.some((p) => p.id === tab);
    if (valid && tab !== activeProjectId) setActiveProjectId(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isStrategy = activeProjectId === STRATEGY_TAB_ID;
  const isProcesos = activeProjectId === PROCESOS_TAB_ID;
  const activeProject = projects.find((p) => p.id === activeProjectId);

  return (
    <div>
      {/* Tab bar */}
      <div className="border-b border-gray-800 px-6 flex items-center gap-1 overflow-x-auto">
        {projects.map((p) => {
          const isActive = p.id === activeProjectId;
          return (
            <button
              key={p.id}
              onClick={() => selectTab(p.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? "border-brand text-white"
                  : "border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-700"
              }`}
            >
              {p.name}
            </button>
          );
        })}

        {/* Procesos — pestaña top-level del cliente. Muestra la sección "procesos"
            del canvas de Información del cliente (mismo storage, superficie dedicada). */}
        <button
          onClick={() => selectTab(PROCESOS_TAB_ID)}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            isProcesos
              ? "border-brand text-white"
              : "border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-700"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
          </svg>
          Procesos
        </button>

        {/* Información del cliente — siempre al final. Internamente sigue siendo
            el Project con serviceType=__strategy__ (mismo storage; cambia el
            label visible y el contenido del panel). */}
        <button
          onClick={() => selectTab(STRATEGY_TAB_ID)}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            isStrategy
              ? "border-brand text-white"
              : "border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-700"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Información del cliente
        </button>
      </div>

      {/* Content */}
      {isStrategy ? (
        <ClientInfoPanel
          key={STRATEGY_TAB_ID}
          projectId={strategyProjectId}
          canvasId={strategyCanvasId}
        />
      ) : isProcesos ? (
        <ClientProcesosPanel
          key={PROCESOS_TAB_ID}
          clientId={clientId}
          projectId={strategyProjectId}
          canvasId={strategyCanvasId}
        />
      ) : activeProjectId && activeProject ? (
        <ProjectCanvasPanel
          key={activeProjectId}
          projectId={activeProjectId}
          tags={activeProject.tags}
          serviceType={activeProject.serviceType}
        />
      ) : null}
    </div>
  );
}
