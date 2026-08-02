"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useWorkspace } from "@/components/clients/WorkspaceContext";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { invalidateGps } from "@/lib/clients/gps-cache";
import ClientInfoPanel from "@/components/clients/ClientInfoPanel";
import ProjectCanvasPanel from "@/components/clients/ProjectCanvasPanel";
import ClientProcesosPanel from "@/components/clients/ClientProcesosPanel";
import AltaTrabada from "@/components/projects/AltaTrabada";
import {
  SENTINEL_SERVICE_TYPE,
  hechosDeProyecto,
  projectCapabilities,
  resolvePipeline,
} from "@/lib/projects/kind";

// El id del tab de "Información del cliente" ES el sentinel: el layout lo devuelve como
// `initialProjectId` cuando el cliente no tiene un único proyecto. Importado y no escrito
// a mano — este archivo es un componente de CLIENTE y por eso antes no podía hacerlo (la
// constante vivía en un módulo que importa Prisma).
const STRATEGY_TAB_ID = SENTINEL_SERVICE_TYPE;
const PROCESOS_TAB_ID = "__procesos__";

interface ProjectSummary {
  id: string;
  name: string;
  status: string;
  projectType?: string | null;
  serviceType?: string | null;
  tags?: string[];
  hubspotServiceId?: string | null;
  // De qué CLASE es (lib/projects/kind.ts). Alimentan la tira de abajo del rail, que es
  // lo único que le explica al CSE por qué este proyecto no está en su cartera.
  hubspotPipelineId?: string | null;
  proyectoInterno?: boolean;
  hermanoCsProjectId?: string | null;
  /** `Project.altaEstado` — un alta a medio hacer no cobra ni se publica (lib/projects/alta.ts). */
  altaEstado?: string | null;
  /** Diagnóstico del alta trabada: alimentan el cartel con el botón "Reintentar". */
  altaError?: string | null;
  altaUltimoIntentoAt?: Date | string | null;
  altaIntentos?: number | null;
}

/**
 * La tira que explica de qué clase es el proyecto.
 *
 * Silenciosa por diseño: si el proyecto es una implementación de Customer Success normal
 * —no interno, sin hermano— no devuelve nada. Solo habla cuando el proyecto se comporta
 * distinto de lo que el CSE espera, que es exactamente cuando hace falta.
 */
function TiraDeClase({ p, projects }: { p: ProjectSummary; projects: ProjectSummary[] }) {
  const def = resolvePipeline(p.hubspotPipelineId ?? null);
  const hermano = p.hermanoCsProjectId
    ? projects.find((o) => o.id === p.hermanoCsProjectId)
    : undefined;
  const caps = projectCapabilities(
    hechosDeProyecto({
      hubspotPipelineId: p.hubspotPipelineId ?? null,
      proyectoInterno: p.proyectoInterno ?? false,
      hermanoCsProjectId: p.hermanoCsProjectId ?? null,
      altaEstado: p.altaEstado ?? null,
    }),
  );

  const chips: Array<{ texto: string; ayuda: string }> = [];
  if (def && def.key !== "customer-success") {
    chips.push({ texto: def.label, ayuda: def.help });
  }
  if (p.proyectoInterno) {
    chips.push({
      texto: "Interno",
      ayuda: "Proyecto de Smarteam para Smarteam. No se factura, no es cartera de nadie y no se le publica nada al cliente.",
    });
  }
  if (p.hermanoCsProjectId) {
    chips.push({
      texto: `Hermano de ${hermano?.name ?? "otro proyecto"}`,
      ayuda: "Cuelga de esa implementación en HubSpot, así que no se factura aparte: cobra el hermano.",
    });
  }
  if (!chips.length) return null;

  return (
    <div className="px-6 py-2 flex items-center gap-2 flex-wrap border-b border-line bg-surface-muted">
      {chips.map((c) => (
        <span
          key={c.texto}
          title={c.ayuda}
          className="px-2 py-0.5 rounded-md text-xs font-medium text-fg-secondary border border-line bg-surface"
        >
          {c.texto}
        </span>
      ))}
      {!caps.cobranza && <span className="text-xs text-fg-muted">· no entra a cobranza</span>}
      {!caps.carteraCs && <span className="text-xs text-fg-muted">· no suma a la cartera de CS</span>}
    </div>
  );
}

// ── Main workspace component ─────────────────────────────────────────────────

// Canvas sembrado server-side (page.tsx) para el proyecto inicial — mata el segundo
// WorkspaceSkeleton (el panel arranca con la lista en mano, sin fetch al montar).
export interface SeededCanvas {
  id: string;
  /** Identidad de la pieza (lib/pieces/registry); null en canvases custom del CSE. */
  slug: string | null;
  name: string;
  isDefault: boolean;
  sections: Array<{ key: string; label: string }>;
  /** ¿Tiene contenido real? Viaja desde el server para que el primer pintado del
   *  desplegable no muestre "vacía" en piezas llenas (lib/pieces/piece-content.ts). */
  hasContent: boolean;
  /** El handoff corrió después de escribirse este documento (lib/pieces/piece-staleness.ts). */
  stale?: boolean;
}

export default function WorkspaceClient({
  clientId,
  projects,
  hasHubspot,
  strategyProjectId,
  strategyCanvasId,
  initialCanvases,
  initialCanvasesProjectId,
}: {
  clientId: string;
  projects: ProjectSummary[];
  hasHubspot: boolean;
  strategyProjectId: string;
  strategyCanvasId: string;
  initialCanvases: SeededCanvas[] | null;
  initialCanvasesProjectId: string | null;
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

  /**
   * Estado del sync que pidió una PERSONA, separado del contador de fondo de arriba.
   *
   * `syncing` es true cuando corre CUALQUIERA de los dos syncs de fondo — el de HubSpot y el
   * de Google—, y eso está bien para el indicador flotante ("algo está pasando"). Pero atarle
   * el botón "Actualizar" tendría dos consecuencias falsas: se pintaría "Actualizando…" solo,
   * al abrir la ficha, por una corrida de Google que nadie pidió; y el guard de re-entrada lo
   * dejaría MUDO en esa ventana (click → return silencioso). Un botón que miente sobre lo que
   * está haciendo y que a veces no hace nada sin decirlo es justo el defecto que esta tanda
   * vino a cerrar.
   *
   * El ref es para el guard (una lectura fresca dentro del callback, sin depender del closure)
   * y el state es para pintar. Mismo par que `activeSyncs`/`syncing`.
   */
  const manualEnCurso = useRef(false);
  const [sincronizandoManual, setSincronizandoManual] = useState(false);

  /**
   * Sincronización con HubSpot. DOS modos, y la diferencia no es cosmética:
   *
   *  · `force=false, avisar=false` — la de FONDO, al entrar al cliente. Respeta el cooldown de
   *    10 min del server y no dice nada: nadie la pidió.
   *  · `force=true, avisar=true`  — la que dispara una PERSONA (el botón "Actualizar" y el del
   *    banner). Saltea el cooldown y SIEMPRE cuenta qué pasó.
   *
   * Lo segundo es la parte que faltaba: hasta el 2026-08-02 el éxito era MUDO —solo un
   * `router.refresh()` si algo había cambiado—, así que una corrida frenada por el cooldown y
   * una que miró y no encontró nada se veían exactamente igual: nada. Un botón que no contesta
   * es peor que no tener botón.
   */
  const runHubspotSync = useCallback(async (force = false, avisar = false) => {
    // Guard de re-entrada: el server ya tiene mutex, pero frenar acá evita el viaje de ida y
    // que el usuario vea dos toasts por un doble click. Mira SOLO las corridas manuales: si
    // mirara el contador global, un sync de fondo de Google dejaría el botón mudo.
    if (avisar) {
      if (manualEnCurso.current) return;
      manualEnCurso.current = true;
      setSincronizandoManual(true);
    }
    startSync();
    if (avisar) toast.info("Buscando proyectos nuevos en HubSpot… puede tardar un momento.");
    try {
      const res = await fetch(`/api/clients/${clientId}/sync-projects${force ? "?force=1" : ""}`, { method: "POST" });
      if (!res.ok) throw new Error("sync failed");
      const data = await res.json();
      setSyncResult({
        created: data.created,
        updated: data.updated,
        errors: Array.isArray(data.errors) ? data.errors : [],
      });
      setSyncDone(true);
      if (data.created || data.updated) router.refresh();
      if (avisar) {
        const primerError = Array.isArray(data.errors) ? data.errors[0] : null;
        if (primerError) {
          // Los errores del sync ya vienen redactados para humano — se muestran tal cual.
          toast.error(primerError);
        } else if (data.omitido) {
          /* El server frenó a propósito. Decirlo es la diferencia entre "no pasó nada" y
             "no hacía falta": sin esto el botón parece roto.
             ⚠ El caso "piso" NO puede decir "se sincronizó": el piso también se aplica cuando el
             intento anterior FALLÓ (el cooldown se reclama al arrancar, a propósito, para hacer
             back-off ante presión de pool). Afirmar un éxito que no ocurrió es peor que el
             silencio que vinimos a arreglar — por eso habla de INTENTO, que es cierto siempre. */
          toast.info(
            data.omitido === "en_vuelo"
              ? "Ya había una sincronización en curso; te muestro su resultado."
              : data.omitido === "piso"
                ? "Se intentó hace menos de un minuto. Esperá un momento y volvé a probar."
                : "Ya se sincronizó hace poco. Probá de nuevo en un rato.",
          );
        } else if (data.created || data.updated) {
          const partes = [
            data.created ? `${data.created} proyecto${data.created === 1 ? "" : "s"} nuevo${data.created === 1 ? "" : "s"}` : null,
            data.updated ? `${data.updated} actualizado${data.updated === 1 ? "" : "s"}` : null,
          ].filter(Boolean);
          toast.success(`HubSpot: ${partes.join(" y ")}.`);
        } else {
          toast.success("Todo al día: no hay proyectos nuevos en HubSpot.");
        }
      }
    } catch {
      setSyncDone(true);
      toast.error("No se pudo sincronizar con HubSpot.", {
        action: { label: "Reintentar", onClick: () => void runHubspotSync(true, true) },
      });
    } finally {
      endSync();
      if (avisar) {
        manualEnCurso.current = false;
        setSincronizandoManual(false);
      }
    }
  }, [clientId, router, toast, startSync, endSync]);

  useEffect(() => {
    if (!hasHubspot || syncedRef.current) return;
    syncedRef.current = true;
    // Diferir la sync FUERA de la ráfaga de montaje: GPS + cronograma cargan primero y el sync
    // (background) arranca ~1.5s después → no compite por el pool de conexiones en el instante crítico.
    const t = setTimeout(() => void runHubspotSync(), 1500);
    return () => clearTimeout(t);
  }, [hasHubspot, runHubspotSync]);

  // Auto-sync de Google Meet en background — descubre transcripts/Docs nuevos sin que
  // el usuario dispare nada. Cooldown de 20 min en el endpoint. Si descubre cosas
  // nuevas, bumpea la señal para refrescar el GPS.
  useEffect(() => {
    // Diferida y escalonada tras la de HubSpot (~2.5s): otro consumidor de fondo que no debe competir
    // con GPS + cronograma por el pool en el montaje. Tiene cooldown de 20 min propio en el endpoint.
    const t = setTimeout(() => {
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
    }, 2500);
    return () => clearTimeout(t);
  }, [bumpGpsRefresh, startSync, endSync]);

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 57px)" }}>
      {/* Indicador discreto de sync de fondo (F4) — desaparece al terminar bien. */}
      {syncing && (
        <div
          className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-line bg-surface/90 px-3 py-1.5 text-[11px] font-medium text-fg-secondary shadow-lg backdrop-blur"
          title="Sincronizando con HubSpot y Google en segundo plano"
        >
          <span className="w-3 h-3 border-2 border-line border-t-brand rounded-full animate-spin" />
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
              {/* ⚠ Llamaba `runHubspotSync()` SIN force, o sea que dentro del cooldown de 10 min
                  no hacía absolutamente nada — y el cooldown YA estaba reclamado por la auto-sync
                  del montaje, así que ése era el caso NORMAL. Un botón que dice "Reintentar" y no
                  reintenta. (Los comentarios de tres archivos daban por hecho que sí forzaba.) */}
              <button
                onClick={() => void runHubspotSync(true, true)}
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
          initialCanvases={initialCanvases}
          initialCanvasesProjectId={initialCanvasesProjectId}
          hasHubspot={hasHubspot}
          sincronizando={sincronizandoManual}
          onSync={() => void runHubspotSync(true, true)}
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
  initialCanvases,
  initialCanvasesProjectId,
  hasHubspot,
  sincronizando,
  onSync,
}: {
  clientId: string;
  projects: ProjectSummary[];
  strategyProjectId: string;
  strategyCanvasId: string;
  initialCanvases: SeededCanvas[] | null;
  initialCanvasesProjectId: string | null;
  /** Sin conexión a HubSpot no hay nada que actualizar → el botón ni se pinta. */
  hasHubspot: boolean;
  /**
   * SOLO la corrida que pidió una persona — deliberadamente NO el `syncing` global del
   * workspace, que también se prende con el sync de fondo de Google: el botón se pintaría
   * "Actualizando…" al abrir la ficha sin que nadie lo tocara.
   */
  sincronizando: boolean;
  onSync: () => void;
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
      {/* Tab bar. El scroll horizontal vive en el contenedor INTERNO, no en la fila: si no,
          con muchos proyectos el botón "Actualizar" se iría con el scroll y dejaría de estar
          donde uno lo busca. */}
      <div className="border-b border-line px-6 flex items-center">
      <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0">
        {projects.map((p) => {
          const isActive = p.id === activeProjectId;
          return (
            <button
              key={p.id}
              onClick={() => selectTab(p.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? "border-brand text-fg"
                  : "border-transparent text-fg-muted hover:text-fg-secondary hover:border-line"
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
              ? "border-brand text-fg"
              : "border-transparent text-fg-muted hover:text-fg-secondary hover:border-line"
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
              ? "border-brand text-fg"
              : "border-transparent text-fg-muted hover:text-fg-secondary hover:border-line"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Información del cliente
        </button>
      </div>

      {/* Traer AHORA los proyectos de HubSpot.
          Por qué existe: la sincronización automática del montaje corre SIN `force`, así que
          respeta el cooldown de 10 min del server — recargar la página cinco veces no baja un
          solo dato nuevo. Sin este botón no había forma de pedir datos frescos a demanda: el
          "Reintentar" del banner solo se pinta cuando el cliente quedó con CERO proyectos, y el
          del toast solo cuando el pedido TIRA. El caso normal —"acabo de crear el proyecto en
          HubSpot, traelo"— no tenía puerta.
          Discreto a propósito (`secondary`, `xs`): es una acción de mantenimiento, no el trabajo
          de la pantalla. Los frenos que lo hacen seguro (mutex + piso duro) están en el server,
          donde no dependen de que la UI se porte bien. */}
      {hasHubspot && (
        <Button
          variant="secondary"
          size="xs"
          className="ml-3 shrink-0"
          loading={sincronizando}
          onClick={onSync}
          title="Traer de HubSpot los proyectos de este cliente"
        >
          {sincronizando ? "Actualizando…" : "Actualizar"}
        </Button>
      )}
      </div>

      {/* De qué CLASE es el proyecto activo. Solo aparece cuando hay algo que explicar:
          para una implementación de Customer Success normal —el 99% de los casos— no se
          pinta nada. Es la única superficie que responde "¿por qué este proyecto no me
          aparece en la cartera / en cobranza?" sin tener que abrir HubSpot. */}
      {activeProject && <TiraDeClase p={activeProject} projects={projects} />}

      {/* El alta que quedó a medio hacer, con su botón de retomar. Va ARRIBA del contenido y
          no adentro de un panel: mientras el alta no termine, el proyecto no cobra, no suma a
          la cartera y no se le publica nada al cliente — o sea que casi todo lo que se ve más
          abajo está contando una versión incompleta de la verdad. */}
      {activeProject && (
        <AltaTrabada
          variante="compacto"
          projectId={activeProject.id}
          altaEstado={activeProject.altaEstado}
          altaError={activeProject.altaError}
          altaUltimoIntentoAt={
            activeProject.altaUltimoIntentoAt
              ? new Date(activeProject.altaUltimoIntentoAt).toISOString()
              : null
          }
          altaIntentos={activeProject.altaIntentos}
          onTermino={() => {
            invalidateGps(activeProject.id);
            window.location.reload();
          }}
        />
      )}

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
          hubspotPipelineId={activeProject.hubspotPipelineId}
          initialCanvases={activeProjectId === initialCanvasesProjectId ? initialCanvases : null}
        />
      ) : null}
    </div>
  );
}
