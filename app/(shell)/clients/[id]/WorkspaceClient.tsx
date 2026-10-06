"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useWorkspace } from "@/components/clients/WorkspaceContext";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { invalidateGps } from "@/lib/clients/gps-cache";
import ClientInfoPanel from "@/components/clients/ClientInfoPanel";
import AvisoDeFicha from "@/components/clients/AvisoDeFicha";
import ProjectCanvasPanel from "@/components/clients/ProjectCanvasPanel";
import ClientProcesosPanel from "@/components/clients/ClientProcesosPanel";
import AltaTrabada from "@/components/projects/AltaTrabada";
import TimelineProposalPendiente from "@/components/projects/TimelineProposalPendiente";
import RielDelCliente, { type ProyectoDelRiel } from "@/components/clients/RielDelCliente";
import PanelLateral, { usePanelLateral } from "@/components/ui/PanelLateral";
import DisparoDelVigia from "@/components/cs/DisparoDelVigia";
import { parseEstadoDeAlta, siguientePaso } from "@/lib/projects/alta";
import { leerAutoria, type AutoriaDeLaPropuesta } from "@/lib/timeline/autoria-de-la-propuesta";
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
  /** Quién empezó el alta: puede terminarla aunque no tenga la celda. */
  altaActorEmail?: string | null;
  /** Tanda M — `ProjectTimeline.pendingProposal != null`: el handoff dejó cambios de
   *  cronograma sin revisar. Alimenta TimelineProposalPendiente. */
  timelineProposalPending?: boolean;
  /** E2b P7: de dónde viene esa propuesta, quién la dejó y cuándo. null = no se dice. */
  timelineProposalAutoria?: AutoriaDeLaPropuesta | null;
}

/**
 * De qué clase es el proyecto, en palabras, para la fila del riel (rediseño del 2026-10-04).
 *
 * Era la «tira de clase» que se pintaba debajo de las pestañas, y solo hablaba cuando el proyecto
 * se comportaba distinto de lo que el CSE espera. Ahora el tipo va siempre, debajo del nombre —el
 * riel lista los proyectos, y hay que poder distinguirlos—, y lo que implica para la plata y la
 * cartera («no entra a cobranza», «no suma a la cartera de CS») va en el `title`.
 */
function claseDelProyecto(p: ProjectSummary, projects: ProjectSummary[]): Pick<ProyectoDelRiel, "tipo" | "ayuda"> {
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

  const partes = [def?.label ?? "Implementación de HubSpot"];
  const ayuda: string[] = [];
  if (def?.help) ayuda.push(def.help);
  if (p.proyectoInterno) {
    partes.push("interno");
    ayuda.push("Proyecto de Smarteam para Smarteam. No se factura, no es cartera de nadie y no se le publica nada al cliente.");
  }
  if (p.hermanoCsProjectId) {
    partes.push(`hermano de ${hermano?.name ?? "otro proyecto"}`);
    ayuda.push("Cuelga de esa implementación en HubSpot, así que no se factura aparte: cobra el hermano.");
  }
  if (!caps.cobranza) ayuda.push("No entra a cobranza.");
  if (!caps.carteraCs) ayuda.push("No suma a la cartera de CS.");
  return { tipo: partes.join(" · "), ayuda: ayuda.join(" ") };
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
  const [syncResult, setSyncResult] = useState<{
    created?: number;
    updated?: number;
    errors?: string[];
    /** Los que el sync salteó porque alguien los borró desde Nexus — el motivo REAL del cartel. */
    suprimidos?: number;
  } | null>(null);
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
    /* El aviso de arranque se GUARDA para poder descartarlo cuando llega el resultado. Sin el
       id, los dos toasts se apilan y parecen contradecirse ("buscando…" arriba de "todo al
       día"). `dismiss` existe en la API del Toast desde el día uno y no lo usaba nadie.
       Duración alta en vez de 0: si el fetch queda colgado, un toast sticky no se va nunca —
       el proveedor vive en el layout y no se desmonta al navegar. */
    let avisoId: number | null = null;
    if (avisar) {
      avisoId = toast.info("Buscando proyectos nuevos en HubSpot… puede tardar un momento.", {
        duration: 30_000,
      });
    }
    const cerrarAviso = () => {
      if (avisoId !== null) {
        toast.dismiss(avisoId);
        avisoId = null;
      }
    };
    try {
      const res = await fetch(`/api/clients/${clientId}/sync-projects${force ? "?force=1" : ""}`, { method: "POST" });
      if (!res.ok) throw new Error("sync failed");
      const data = await res.json();
      setSyncResult({
        created: data.created,
        updated: data.updated,
        errors: Array.isArray(data.errors) ? data.errors : [],
        /* ⚠ Se copia CAMPO POR CAMPO, así que sumar uno al resultado del sync no alcanza: hay
           que agregarlo también acá o el dato llega al navegador y se tira en esta línea. Pasó
           con `suprimidos` el mismo día que se creó — el endpoint lo devolvía perfecto, el
           cartel lo leía, y entre medio este objeto lo descartaba. El cartel seguía dando el
           motivo genérico y mandando a revisar HubSpot por un problema que no existía. */
        suprimidos: typeof data.suprimidos === "number" ? data.suprimidos : 0,
      });
      setSyncDone(true);
      if (data.created || data.updated) router.refresh();
      cerrarAviso(); // el resultado REEMPLAZA al aviso, no se apila encima
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
      cerrarAviso();
      /* ⚠ Gateado por `avisar`, que antes NO lo estaba: el sync de FONDO del montaje —que nadie
         pidió— podía dejar un error con acción "Reintentar", y como los toasts con acción son
         sticky por diseño, quedaba clavado en pantalla para siempre. */
      if (avisar) {
        toast.error("No se pudo sincronizar con HubSpot.", {
          action: { label: "Reintentar", onClick: () => void runHubspotSync(true, true) },
        });
      }
    } finally {
      cerrarAviso(); // red de seguridad: idempotente, cubre cualquier camino que se me escape
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

  /* Sync no-silencioso: cliente con HubSpot que quedó SIN proyectos visibles tras sincronizar →
     aviso con el motivo + Reintentar (antes era un cliente vacío y mudo, imposible de
     diagnosticar). Va arriba del centro del lienzo. */
  const avisoDeSync =
    hasHubspot && projects.length === 0 && syncDone && !syncing ? (
      /* ⚠ Escrito a mano con colores crudos hasta el 2026-08-05, y era ILEGIBLE en tema
         claro: la descripción daba 1,16:1 y el botón 1,00:1 —el mismo color que su fondo,
         literalmente invisible—. Ahora usa la primitiva, que pinta con tokens medidos en los dos
         temas. */
      <Alert
        variant="warning"
        title={
          (syncResult?.suprimidos ?? 0) > 0
            ? `${syncResult!.suprimidos} proyecto${syncResult!.suprimidos === 1 ? "" : "s"} de este cliente está${syncResult!.suprimidos === 1 ? "" : "n"} oculto${syncResult!.suprimidos === 1 ? "" : "s"}: se borró desde Nexus.`
            : "No se cargó ningún proyecto de HubSpot para este cliente."
        }
        action={
          /* ⚠ Llamaba `runHubspotSync()` SIN force, o sea que dentro del cooldown de 10 min
             no hacía absolutamente nada. Un botón que dice "Reintentar" y no reintenta. */
          <Button size="xs" variant="secondary" onClick={() => void runHubspotSync(true, true)} disabled={syncing}>
            Reintentar
          </Button>
        }
      >
        {/* El motivo tiene que ser el REAL, no el genérico: si el proyecto se borró desde
            Nexus, en HubSpot está perfectamente asociado y mandar a revisarlo allá hace
            perder tiempo buscando un problema que no existe. */}
        {(syncResult?.suprimidos ?? 0) > 0
          ? "En HubSpot sigue existiendo y está bien asociado — Nexus lo ignora a pedido, para no recrearlo. Para volver a traerlo hay que sacarlo de la lista de ignorados."
          : syncResult?.errors && syncResult.errors.length > 0
            ? syncResult.errors[0]
            : "Revisa en HubSpot que el proyecto esté asociado a la empresa de este cliente, y reintenta."}
      </Alert>
    ) : null;

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 57px)" }}>
      {/* El agente vigía, en segundo plano, si hace más de 48 h que no revisa este cliente (D14). */}
      <DisparoDelVigia clientId={clientId} />
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
          avisoDeSync={avisoDeSync}
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
  avisoDeSync,
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
  /** El aviso del sync que no trajo proyectos: va arriba del centro. */
  avisoDeSync: React.ReactNode;
}) {
  const { activeProjectId, setActiveProjectId, gpsRefreshSignal, timelineRefreshSignal } = useWorkspace();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  /* EL AVISO DE PROPUESTA DEL RAIL, VIVO (2026-09-28). `timelineProposalPending` llega con la página y
     nada lo renovaba: al aplicar o descartar la propuesta seguía diciendo que había una, y al regenerar
     el handoff no aparecía. La copia del widget, que sí escuchaba estas señales, se fue con 14b8c920.
     Cuando el cronograma o el handoff avisan que algo cambió, se relee SOLO eso
     (GET /api/projects/[id]/timeline/proposal), con una espera corta para juntar avisos seguidos. No
     `router.refresh()`: recarga la página entera, que además consulta HubSpot, por cada aviso. */
  const [propuestaViva, setPropuestaViva] = useState<
    Record<string, { pending: boolean; autoria: AutoriaDeLaPropuesta | null }>
  >({});
  const senalesVistas = useRef({ gps: gpsRefreshSignal, timeline: timelineRefreshSignal });
  useEffect(() => {
    const vistas = senalesVistas.current;
    if (vistas.gps === gpsRefreshSignal && vistas.timeline === timelineRefreshSignal) return;
    senalesVistas.current = { gps: gpsRefreshSignal, timeline: timelineRefreshSignal };
    const id = activeProjectId;
    if (!id || id === STRATEGY_TAB_ID || id === PROCESOS_TAB_ID) return;
    let vivo = true;
    const t = setTimeout(() => {
      fetch(`/api/projects/${encodeURIComponent(id)}/timeline/proposal`)
        .then((r) => (r.ok ? (r.json() as Promise<{ pending?: boolean; autoria?: unknown }>) : null))
        .then((j) => {
          // La autoría del cable se VALIDA (leerAutoria), igual que la del GPS y la del cronograma.
          if (vivo && j) setPropuestaViva((p) => ({ ...p, [id]: { pending: !!j.pending, autoria: leerAutoria(j.autoria) } }));
        })
        .catch(() => {});
    }, 600);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [gpsRefreshSignal, timelineRefreshSignal, activeProjectId]);
  // Datos nuevos del servidor (el sync de HubSpot hace router.refresh): mandan sobre lo releído.
  useEffect(() => {
    setPropuestaViva({});
  }, [projects]);

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

  /* LA PESTAÑA SIGUE A `?tab=` DESPUÉS DE MONTAR (2026-09-28). El «Ver» de una corrida de otro
     proyecto del mismo cliente (centro de corridas, aviso de «Listo») navega a `?tab=P2&canvas=…`
     sin recargar: la pestaña se quedaba en P1 y su panel aplicaba el documento de P2. Solo cambia
     con un id válido y distinto; `selectTab` escribe la URL después de fijar la pestaña, así que
     cuando la URL llega ya coincide y esto no hace nada. */
  const tabDeLaUrl = searchParams.get("tab");
  useEffect(() => {
    if (!tabRestoredRef.current || !tabDeLaUrl || tabDeLaUrl === activeProjectId) return;
    const valida =
      tabDeLaUrl === STRATEGY_TAB_ID || tabDeLaUrl === PROCESOS_TAB_ID || projects.some((p) => p.id === tabDeLaUrl);
    if (valida) setActiveProjectId(tabDeLaUrl);
    // Solo cuando cambia la URL: si dependiera de `activeProjectId`, un clic en una pestaña (que
    // fija la pestaña ANTES de escribir la URL) volvería a la anterior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabDeLaUrl]);

  const isStrategy = activeProjectId === STRATEGY_TAB_ID;
  const isProcesos = activeProjectId === PROCESOS_TAB_ID;
  const activeProject = projects.find((p) => p.id === activeProjectId);

  /* El proyecto cuyas piezas cuelgan en el riel: el abierto o, mientras se mira algo de la cuenta
     («Información del cliente», «Procesos»), el último que se abrió. Su panel queda MONTADO y
     oculto —como el Resumen dentro de un proyecto—, así sus piezas siguen en el riel y volver a él
     no recarga nada. Sin ninguno abierto todavía, los proyectos se ven plegados. */
  const [ultimoProyecto, setUltimoProyecto] = useState<string | null>(activeProject ? activeProject.id : null);
  if (activeProject && ultimoProyecto !== activeProject.id) setUltimoProyecto(activeProject.id);
  const proyectoDelRiel = activeProject ?? projects.find((p) => p.id === ultimoProyecto) ?? null;

  /* Dónde se pintan las piezas (en el riel) y el contexto (en el panel derecho). Los dueños de
     cada vista los llenan por portal: el panel del proyecto sabe sus piezas y su «Qué sigue», la
     información del cliente sabe sus licencias. Estado y no ref: el portal tiene que re-renderizar
     cuando el nodo aparece. */
  const [slotDePiezas, setSlotDePiezas] = useState<HTMLDivElement | null>(null);
  const [slotDelPanel, setSlotDelPanel] = useState<HTMLDivElement | null>(null);

  /* Ocultar el panel (para proyectar un documento en una reunión) es la MISMA preferencia que la
     columna derecha de todas las pantallas: `PanelLateral`, con la cookie `nexus-panel` que lee el
     servidor (components/ui/PanelLateral.tsx). Antes era una preferencia propia guardada en el
     navegador y leída en un efecto: cada carga pintaba el panel abierto y lo cerraba de un salto. */
  const panelVisible = usePanelLateral()?.abierto ?? true;

  /** Abrir una pieza de un proyecto que no está en el centro (se mira algo de la cuenta). */
  const abrirEnProyecto = useCallback(
    (projectId: string, canvasId: string | null) => {
      setActiveProjectId(projectId);
      const params = new URLSearchParams(Array.from(searchParams.entries()));
      params.set("tab", projectId);
      if (canvasId) params.set("canvas", canvasId);
      else params.delete("canvas");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, pathname, router, setActiveProjectId],
  );

  const propuestaPendiente = activeProject
    ? (propuestaViva[activeProject.id]?.pending ?? activeProject.timelineProposalPending ?? false)
    : false;
  const altaPendiente = activeProject ? siguientePaso(parseEstadoDeAlta(activeProject.altaEstado ?? null)) !== null : false;

  const filasDelRiel: ProyectoDelRiel[] = projects.map((p) => ({ id: p.id, nombre: p.name, ...claseDelProyecto(p, projects) }));

  return (
    /* El lienzo de tres columnas, como la preventa (sistema «Nexus · interfaz interna»): a la
       izquierda el riel (14,5rem), al centro una sola tarea, a la derecha el panel de contexto
       (18,75rem). Debajo de 1280 px el panel baja al final; debajo de 1024 px el riel se acuesta.
       La tercera columna es `auto`: la mide el ancho del panel, abierto o cerrado. */
    <div className="min-h-full bg-surface-muted lg:grid lg:grid-cols-[14.5rem_minmax(0,1fr)] xl:grid-cols-[14.5rem_minmax(0,1fr)_auto]">
      <aside className="border-b border-line bg-surface px-3 py-4 lg:sticky lg:top-0 lg:h-[calc(100vh-57px)] lg:self-start lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <RielDelCliente
          proyectos={filasDelRiel}
          activo={activeProject?.id ?? null}
          proyectoDelRiel={proyectoDelRiel?.id ?? null}
          onElegirProyecto={selectTab}
          onElegirCuenta={(que) => selectTab(que === "info" ? STRATEGY_TAB_ID : PROCESOS_TAB_ID)}
          cuentaActiva={isStrategy ? "info" : isProcesos ? "procesos" : null}
          avisoDeLaFicha={<AvisoDeFicha clientId={clientId} />}
          slotDePiezas={setSlotDePiezas}
          /* Traer AHORA los proyectos de HubSpot. La sincronización del montaje corre SIN
             `force` y respeta el cooldown de 10 min: recargar la página no baja un dato nuevo, y el
             caso normal —«acabo de crear el proyecto en HubSpot, tráelo»— no tenía puerta. Los
             frenos que lo hacen seguro (mutex + piso duro) están en el server. */
          traer={{ visible: hasHubspot, sincronizando, onClick: onSync }}
        />
      </aside>

      <main className="min-w-0">
        {avisoDeSync && <div className="px-6 pt-6">{avisoDeSync}</div>}

        {isStrategy && (
          <ClientInfoPanel
            key={STRATEGY_TAB_ID}
            projectId={strategyProjectId}
            canvasId={strategyCanvasId}
            slotDelPanel={panelVisible ? slotDelPanel : null}
          />
        )}
        {isProcesos && (
          <ClientProcesosPanel
            key={PROCESOS_TAB_ID}
            clientId={clientId}
            slotDelPanel={panelVisible ? slotDelPanel : null}
          />
        )}
        {proyectoDelRiel && (
          <ProjectCanvasPanel
            key={proyectoDelRiel.id}
            projectId={proyectoDelRiel.id}
            nombreDelProyecto={proyectoDelRiel.name}
            tags={proyectoDelRiel.tags}
            hubspotPipelineId={proyectoDelRiel.hubspotPipelineId}
            initialCanvases={proyectoDelRiel.id === initialCanvasesProjectId ? initialCanvases : null}
            visible={!!activeProject}
            slotDePiezas={slotDePiezas}
            slotDelPanel={activeProject && panelVisible ? slotDelPanel : null}
            propuestaPendiente={activeProject ? propuestaPendiente : (proyectoDelRiel.timelineProposalPending ?? false)}
            queSigueOcupado={altaPendiente || propuestaPendiente}
            onAbrirDesdeOculto={(canvasId) => abrirEnProyecto(proyectoDelRiel.id, canvasId)}
          />
        )}
      </main>

      <PanelLateral
        etiqueta="Panel"
        breakpoint="xl"
        ancho="xl:w-[18.75rem]"
        className="py-5"
        fijas="lg:col-span-2 xl:sticky xl:top-0 xl:col-span-1 xl:h-[calc(100vh-57px)] xl:self-start xl:overflow-y-auto"
      >
        {/* Cerrado, lo de adentro se desmonta (como antes): las piezas del proyecto reciben el
            espacio del panel solo cuando se ve (`slotDelPanel`), y no pintan en uno oculto. */}
        {panelVisible && (
          <>
            {/* El alta que quedó a medio hacer, con su botón de retomar. Va primero en el panel —que
                se ve en todos los documentos— y no adentro de una pieza: mientras el alta no
                termine, el proyecto no cobra, no suma a la cartera y no se le publica nada al
                cliente, o sea que casi todo lo demás cuenta una versión incompleta de la verdad. */}
            {activeProject && (
              <AltaTrabada
                variante="completo"
                projectId={activeProject.id}
                altaEstado={activeProject.altaEstado}
                altaError={activeProject.altaError}
                altaUltimoIntentoAt={
                  activeProject.altaUltimoIntentoAt
                    ? new Date(activeProject.altaUltimoIntentoAt).toISOString()
                    : null
                }
                altaIntentos={activeProject.altaIntentos}
                altaActorEmail={activeProject.altaActorEmail}
                onTermino={() => {
                  invalidateGps(activeProject.id);
                  window.location.reload();
                }}
              />
            )}
            {/* Tanda M — la propuesta de cronograma sin decidir. Mismo criterio que el alta: se ve
                sin entrar al cronograma, que es justo donde este aviso vivía enterrado antes. Con
                ella a la vista, el panel del proyecto no repite otro «Qué sigue». */}
            {activeProject && !altaPendiente && (
              <TimelineProposalPendiente
                variante="panel"
                projectId={activeProject.id}
                clientId={clientId}
                pending={propuestaViva[activeProject.id]?.pending ?? activeProject.timelineProposalPending ?? false}
                autoria={propuestaViva[activeProject.id] ? propuestaViva[activeProject.id].autoria : (activeProject.timelineProposalAutoria ?? null)}
              />
            )}
            <div ref={setSlotDelPanel} className="flex flex-col gap-6" />
          </>
        )}
      </PanelLateral>
    </div>
  );
}
