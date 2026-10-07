"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Alert, Modal } from "@/components/ui";
import { BotonAzul, BotonBlanco, BotonEnlace, FranjaDeSugerencias, QueSigue } from "@/components/ui/sistema";
import MinuteDialog from "./MinuteDialog";
import ActionItemsDialog from "./ActionItemsDialog";
import { useWorkspace } from "./WorkspaceContext";
import { useToast } from "@/components/ui/Toast";
import { readGpsCache, writeGpsCache, invalidateGps } from "@/lib/clients/gps-cache";
import { calendarDaysFromToday } from "@/lib/utils/relative-date";
import { ProjectGpsSkeleton } from "./skeletons";
import type { Frente, FrenteKey } from "@/lib/projects/kind";
import { pctConTranscript, type CoberturaDelCliente } from "@/lib/sessions/cobertura-por-cse";
import type { ChipDeCanvas } from "@/lib/flow/canvas-chips";
import type { EtapaParaLaUI } from "@/lib/lifecycle/etapa-ui";
import StageBadge from "@/components/lifecycle/StageBadge";
import ProjectBriefSection, { type BriefDeProyecto } from "@/components/projects/ProjectBriefSection";
import ProjectSessionsReview from "./ProjectSessionsReview";
import { useContextoDelResumen, type AvisoDePieza } from "./contexto-del-resumen";
import { porQueEstaAca, queSigueDelProyecto, restoDeLosPendientes } from "@/lib/clients/que-sigue-del-proyecto";
import type { EtapaEnHubspot } from "@/lib/projects/etapa-sugerida";
import { useMe } from "@/hooks/useMe";
import EncuestaDeEtapa from "./EncuestaDeEtapa";


export interface PendingItem {
  id?: string;             // ActionItem.id (nuevo) — undefined si viene del Json viejo
  text: string;
  done: boolean;
  source?: string;
  addedAt?: string;
  // Campos del modelo ActionItem
  ownerEmail?: string | null;
  /** Quién se comprometió (2026-10-02): el compromiso puede ser del CLIENTE, sin correo del equipo. */
  ladoResponsable?: string | null;
  responsableNombre?: string | null;
  dueDate?: string | null; // ISO
  status?: "PENDING" | "IN_PROGRESS" | "BLOCKED" | "DONE";
  deletedAt?: string | null; // ISO — set si la tarea fue borrada (soft-delete) → Histórico
  sessionId?: string | null;
  sessionTitle?: string | null;
}

interface NextSessionInfo {
  date: string | null;
  title: string | null;
  note: string | null;
  googleEventId: string | null;
  source: "manual" | "auto" | null;
}

interface LastSessionInfo {
  date: string | null;
  title: string | null;
  summary: string | null;
  googleDocId: string | null;
  source: "manual" | "auto" | null;
}

// Próxima de un frente (Ventas / CSE). source: manual (ajena a meets) o auto.
interface FrontNext {
  date: string;
  title: string | null;
  note: string | null;
  mixed: boolean;
  googleDocId: string | null;
  googleEventId: string | null;
  source: "manual" | "auto";
}
// Última de un frente (siempre auto-detectada).
interface FrontLast {
  date: string;
  title: string | null;
  summary: string | null;
  mixed: boolean;
  googleDocId: string | null;
  source: "auto";
}
interface FrontPair {
  next: FrontNext | null;
  last: FrontLast | null;
}

interface ProjectInfo {
  name: string | null;
  /** Ficha del proyecto en HubSpot, armada en el servidor. `null`/ausente = proyecto sin
      espejo o sin portal: se pinta el nombre sin enlace, nunca un link a medias. */
  hubspotUrl?: string | null;
  pipelineName: string | null;
  cseEncargado: string | null;
  cseEncargadoEmail: string | null;
  createdAt: string | null;
  createdAtSource: "hubspot" | "nexus";
}

interface GPSData {
  // Legacy (compat hacia atrás)
  nextSessionDate: string | null;
  nextSessionNote: string | null;
  lastSessionSummary: string | null;
  pendingItems: PendingItem[];
  currentState: string | null;

  // Enriquecidos (nueva API)
  nextSession?: NextSessionInfo;
  lastSession?: LastSessionInfo;
  fronts?: { ventas: FrontPair; cs: FrontPair };
  /**
   * QUÉ frentes pintar y con qué rótulo, EN ORDEN. Lo decide el SERVIDOR desde la tabla de
   * `lib/projects/kind.ts`: un desarrollo muestra "Desarrollo" donde una implementación
   * muestra "CSE", y si cuelga de un hermano no muestra "Ventas" (esa conversación vive
   * allá). El widget solo pinta la lista que recibe.
   *
   * Opcional: una respuesta cacheada de antes de este cambio no la trae, y ahí se pinta la
   * lista de siempre en vez de nada.
   */
  frentes?: Frente[];
  /** D-08: % de reuniones del cliente con transcripción (últimos 90 días). Ausente en respuestas viejas. */
  coberturaDelCliente?: CoberturaDelCliente | null;
  projectInfo?: ProjectInfo;
  historyItems?: PendingItem[]; // tareas hechas o borradas (tab Histórico del modal)
  setup?: SetupSignals; // #5 — qué canvas tiene generados el proyecto (indicador del widget)
  /**
   * Los CANVAS del proyecto, ya filtrados por lo que le corresponde (`piezaAplica`) y con su
   * estado. El servidor decide QUÉ se lista; el widget solo pinta — así una pieza nueva del
   * recorrido aparece sola, sin tocar React.
   *
   * Opcional: una respuesta cacheada de antes de este cambio no lo trae y el bloque no se
   * pinta (en vez de romper).
   */
  canvasChips?: ChipDeCanvas[];
  /**
   * La ETAPA lista para pintar, venga del pipeline de HubSpot o del ciclo de 8 etapas.
   * `null` = no hay etapa que mostrar (hoy: un proyecto del ciclo de CS sin handoff).
   * Ausente = respuesta cacheada vieja → cae al rótulo plano de `currentState`.
   */
  etapa?: EtapaParaLaUI | null;
  /**
   * El alta que quedó a medio hacer (Tanda C). Ausente en respuestas cacheadas viejas y, en
   * el 99% de los proyectos, con `estado` en null — el cartel decide no pintarse leyendo el
   * estado, así que ambos casos terminan igual.
   */
  alta?: {
    estado?: string | null;
    error?: string | null;
    ultimoIntentoAt?: string | null;
    intentos?: number | null;
    /** Quién empezó el alta: puede terminarla aunque no tenga la celda. */
    actorEmail?: string | null;
  } | null;
  /** Tanda M — `ProjectTimeline.pendingProposal != null`: el handoff dejó cambios de
   *  cronograma sin revisar. Ausente en respuestas cacheadas viejas = no se pinta. */
  timelineProposalPending?: boolean;
  /** E2b P7: de dónde viene, quién la dejó y cuándo. Se valida con `leerAutoria` (puede venir de
   *  una respuesta cacheada vieja, sin el campo). */
  timelineProposalAutoria?: unknown;
  /**
   * El resumen citado del proyecto, con su veredicto de frescura YA resuelto en el servidor.
   * `null` = todavía no se generó (se pinta el CTA); ausente = respuesta cacheada vieja, y el
   * bloque no aparece en vez de romper.
   */
  brief?: BriefDeProyecto | null;
  /** Lo abierto de las últimas 4 semanas, vencido primero (2026-10-04). Ausente en respuestas
   *  cacheadas viejas: ahí se cae a los abiertos de siempre. */
  pendientesRecientes?: PendingItem[];
  /** Cuántos abiertos son de las últimas 4 semanas (el panel muestra hasta 5). Ausente en
   *  respuestas cacheadas viejas: ahí se dice «y N más» sin decir de cuándo. */
  pendientesRecientesTotal?: number;
  /** Cuántos abiertos hay en total, para el «y N más». */
  pendientesAbiertos?: number;
  /**
   * La encuesta de la etapa (lib/projects/etapa-sugerida.ts): las etapas que se pueden elegir, la
   * sugerencia de una reunión si sigue en pie, y por qué no se puede mover desde Nexus. Ausente en
   * respuestas cacheadas viejas; `null` si el proyecto no tiene tablero en HubSpot.
   */
  etapaHubspot?: EtapaEnHubspot | null;
}

/** La RANURA de almacenamiento del frente, no su rótulo — ver `FrenteKey` en kind.ts. */
type FrontKey = FrenteKey;

/** Fallback de `frentes` para respuestas viejas cacheadas. */
const FRENTES_LEGACY: Frente[] = [
  { key: "ventas", label: "Ventas", equipo: "ventas" },
  { key: "cs", label: "CSE", equipo: "entrega" },
];

// Campos del Project (PUT) donde se persiste el override manual de cada frente. La clave es
// la RANURA de almacenamiento, no el rótulo: la columna "cs" es la del frente de ENTREGA.
const FRONT_FIELDS: Record<FrontKey, { date: string; note: string }> = {
  ventas: { date: "salesNextSessionDate", note: "salesNextSessionNote" },
  cs: { date: "csNextSessionDate", note: "csNextSessionNote" },
};

const EMPTY_PAIR: FrontPair = { next: null, last: null };

// Señales de setup del proyecto (espejo del tipo de lib/portfolio/project-setup; inline para
// no arrastrar el módulo server —prisma— al bundle del cliente). El indicador del widget las usa.
type SetupSignals = {
  handoff: boolean;
  /** `null` = no le corresponde a este proyecto (su pipeline no nace con kickoff) → sin chip. */
  kickoff: boolean | null;
  cronograma: "sin" | "borrador" | "publicado";
  procesos: boolean;
};


export default function ProjectGPS({ projectId, clientId }: { projectId: string; clientId: string }) {
  // Inicializa desde el cache de módulo → al remontar (cambio de tab) renderiza al
  // instante, sin recarga. (Ver lib/clients/gps-cache.ts)
  const { gpsRefreshSignal } = useWorkspace();
  const toast = useToast();
  const [data, setData] = useState<GPSData | null>(() => readGpsCache<GPSData>(projectId)?.data ?? null);
  const [error, setError] = useState<string | null>(null);
  const [editingFront, setEditingFront] = useState<FrontKey | null>(null);
  const [minuteDialogOpen, setMinuteDialogOpen] = useState(false);
  const [itemsDialogOpen, setItemsDialogOpen] = useState(false);
  const frontDateRef = useRef<HTMLInputElement>(null);
  const resumenCtx = useContextoDelResumen();
  const { onEtapa, onQueSigue, onAvisosDePiezas } = resumenCtx;
  const [sesionesAbiertas, setSesionesAbiertas] = useState(false);
  const [encuestaAbierta, setEncuestaAbierta] = useState(false);
  const me = useMe();
  const puedeMoverLaEtapa = me?.permissions?.sections?.proyectos?.cambiarEstadoHubspot === true;
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const fetchGPS = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/gps`);
      if (!res.ok) {
        let detail = `Error ${res.status}`;
        try {
          const text = await res.text();
          const parsed = (() => { try { return JSON.parse(text); } catch { return null; } })();
          if (parsed?.error) detail = parsed.error;
        } catch { /* ignore */ }
        setError(detail);
        return;
      }
      const d = await res.json();
      setData(d);
      writeGpsCache(projectId, d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    }
  }, [projectId]);

  // Montaje: SOLO fetch si NO hay cache → cambiar de tab o entrar a otro canvas
  // (kickoff, cronograma…) no recarga el widget. El refresh real lo dispara
  // gpsRefreshSignal (sesión nueva detectada por el auto-sync de Meet).
  useEffect(() => {
    if (!readGpsCache<GPSData>(projectId)) fetchGPS();
  }, [projectId, fetchGPS]);

  // Sesión nueva detectada (auto-sync de Meet bumpea la señal) → refetch forzado.
  const firstSignalRef = useRef(true);
  useEffect(() => {
    if (firstSignalRef.current) { firstSignalRef.current = false; return; }
    invalidateGps(projectId);
    fetchGPS();
  }, [gpsRefreshSignal, projectId, fetchGPS]);

  const saveField = useCallback(async (field: string, value: unknown) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/gps`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) toast.error("No se pudo guardar el cambio.");
    } catch {
      toast.error("No se pudo guardar el cambio. Revisa tu conexión.");
    }
  }, [projectId, toast]);

  const debouncedSave = useCallback((field: string, value: unknown) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => saveField(field, value), 500);
  }, [saveField]);

  // ── Edición manual de la PRÓXIMA por frente (reuniones ajenas a meets) ────────
  // Optimista: actualiza el .next del frente como "manual" y persiste. Si se limpia
  // la fecha, refetch para que vuelva a resolver la próxima auto-detectada.
  const onFrontDate = useCallback((frontKey: FrontKey, value: string) => {
    const iso = value ? new Date(value).toISOString() : null;
    saveField(FRONT_FIELDS[frontKey].date, iso);
    if (!iso) {
      invalidateGps(projectId);
      fetchGPS();
      return;
    }
    setData((cur) => {
      if (!cur) return cur;
      const prevPair = cur.fronts?.[frontKey] ?? EMPTY_PAIR;
      const newNext: FrontNext = {
        date: iso,
        title: null,
        note: prevPair.next?.source === "manual" ? prevPair.next.note : null,
        mixed: false,
        googleDocId: null,
        googleEventId: null,
        source: "manual",
      };
      const fronts = {
        ventas: cur.fronts?.ventas ?? EMPTY_PAIR,
        cs: cur.fronts?.cs ?? EMPTY_PAIR,
      };
      fronts[frontKey] = { ...prevPair, next: newNext };
      const next: GPSData = { ...cur, fronts };
      writeGpsCache(projectId, next);
      return next;
    });
  }, [projectId, saveField, fetchGPS]);

  const onFrontNote = useCallback((frontKey: FrontKey, value: string) => {
    debouncedSave(FRONT_FIELDS[frontKey].note, value || null);
    setData((cur) => {
      if (!cur) return cur;
      const prevPair = cur.fronts?.[frontKey];
      if (!prevPair?.next) return cur; // la nota solo aplica con una próxima manual seteada
      const fronts = {
        ventas: cur.fronts?.ventas ?? EMPTY_PAIR,
        cs: cur.fronts?.cs ?? EMPTY_PAIR,
      };
      fronts[frontKey] = { ...prevPair, next: { ...prevPair.next, note: value || null, source: "manual" } };
      const next: GPSData = { ...cur, fronts };
      writeGpsCache(projectId, next);
      return next;
    });
  }, [projectId, debouncedSave]);

  // ── Mutaciones de pendientes (compartidas con el dialog) ──────────────────────
  // Modelo de dos listas: pendingItems = SOLO abiertas; historyItems = hechas o
  // borradas. Las mutaciones MUEVEN el item entre listas (por id), así el tab
  // Pendientes y el tab Histórico del modal se alimentan directo sin filtrar.
  const patchDone = useCallback((id: string, done: boolean) => {
    fetch(`/api/action-items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    }).catch(() => fetchGPS());
  }, [fetchGPS]);

  // Marcar una pendiente como hecha → sale de Pendientes y pasa al Histórico.
  const toggleItem = useCallback(async (id: string) => {
    setData((cur) => {
      if (!cur) return cur;
      const pIdx = cur.pendingItems.findIndex((i) => i.id === id);
      if (pIdx === -1) return cur;
      const item = cur.pendingItems[pIdx];
      const moved: PendingItem = { ...item, done: true, status: "DONE" };
      const next = {
        ...cur,
        pendingItems: cur.pendingItems.filter((_, i) => i !== pIdx),
        historyItems: [moved, ...(cur.historyItems ?? [])],
      };
      writeGpsCache(projectId, next);
      if (item.id) patchDone(item.id, true);
      return next;
    });
  }, [projectId, patchDone]);

  // Restaurar desde el Histórico (hecha o borrada) → vuelve a Pendientes.
  const restoreItem = useCallback(async (id: string) => {
    setData((cur) => {
      if (!cur) return cur;
      const history = cur.historyItems ?? [];
      const hIdx = history.findIndex((i) => i.id === id);
      if (hIdx === -1) return cur;
      const item = history[hIdx];
      const restored: PendingItem = { ...item, done: false, status: "PENDING", deletedAt: null };
      const next = {
        ...cur,
        historyItems: history.filter((_, i) => i !== hIdx),
        pendingItems: [...cur.pendingItems, restored],
      };
      writeGpsCache(projectId, next);
      if (item.id) {
        fetch(`/api/action-items/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ done: false, deletedAt: null }),
        }).catch(() => fetchGPS());
      }
      return next;
    });
  }, [projectId, fetchGPS]);

  const addItem = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const res = await fetch(`/api/action-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: trimmed, clientId, projectId, source: "manual" }),
    });
    if (res.ok) {
      const created = await res.json();
      setData((cur) => {
        if (!cur) return cur;
        const newItem: PendingItem = {
          id: created.id, text: trimmed, done: false, source: "manual",
          ownerEmail: null, dueDate: null, status: "PENDING", sessionId: null, sessionTitle: null,
        };
        const next = { ...cur, pendingItems: [...cur.pendingItems, newItem] };
        writeGpsCache(projectId, next);
        return next;
      });
    }
  }, [clientId, projectId]);

  // Borrar = soft-delete: sale de Pendientes y pasa al Histórico (no se elimina).
  const removeItem = useCallback(async (id: string) => {
    setData((cur) => {
      if (!cur) return cur;
      const pIdx = cur.pendingItems.findIndex((i) => i.id === id);
      if (pIdx === -1) return cur;
      const item = cur.pendingItems[pIdx];
      const deleted: PendingItem = { ...item, deletedAt: new Date().toISOString() };
      const next = {
        ...cur,
        pendingItems: cur.pendingItems.filter((_, i) => i !== pIdx),
        historyItems: [deleted, ...(cur.historyItems ?? [])],
      };
      writeGpsCache(projectId, next);
      if (item.id) {
        fetch(`/api/action-items/${item.id}`, { method: "DELETE" }).catch(() => fetchGPS());
      }
      return next;
    });
  }, [projectId, fetchGPS]);

  // ── Lo que el Resumen le cuenta al panel del proyecto ────────────────────────
  // Se calcula ANTES de los early-returns: los hooks no pueden quedar detrás de un `if`.
  const etapaParaElRiel = data?.etapa?.posicion ? `${data.etapa.posicion.index} de ${data.etapa.posicion.total}` : null;
  useEffect(() => {
    onEtapa(etapaParaElRiel);
  }, [etapaParaElRiel, onEtapa]);

  /* «Opcional» y «sin subir» dejaron de ser chips del widget (el riel ya dice el estado de cada
     pieza) y viajan al riel como su aviso, en NEUTRO: un rojo por algo que no se reclama enseña a
     ignorar los rojos. `PIEZAS_NO_REQUERIDAS` decide cuál es opcional, en el servidor. */
  const canvasChips = data?.canvasChips;
  const avisosDePiezas = useMemo(() => {
    const out: Record<string, AvisoDePieza> = {};
    if (!canvasChips) return out;
    for (const [slug, aviso] of canvasChips.map((c): [string, AvisoDePieza | null] => [
      c.slug,
      c.estado === "opcional"
        ? { corto: "opcional", largo: "Le corresponde a este proyecto, pero no se reclama si no se usa.", tono: "neutro" }
        : c.estado === "borrador"
          ? { corto: "sin subir", largo: "Tiene contenido, pero el cliente todavía no lo ve: falta subirlo.", tono: "neutro" }
          : null,
    ])) {
      if (aviso) out[slug] = aviso;
    }
    return out;
  }, [canvasChips]);
  useEffect(() => {
    onAvisosDePiezas(avisosDePiezas);
  }, [avisosDePiezas, onAvisosDePiezas]);

  /* Las reuniones que asignó la IA y nadie revisó: solo cuentan con 2+ proyectos abiertos en la
     empresa (es la regla del chip de la ficha y del índice). Una lectura por apertura del Resumen. */
  const [sinRevisar, setSinRevisar] = useState(0);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/projects/${projectId}/project-sessions`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { multiProject?: boolean; unreviewedCount?: number } | null) => {
        if (vivo && j) setSinRevisar(j.multiProject ? (j.unreviewedCount ?? 0) : 0);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [projectId, gpsRefreshSignal, sesionesAbiertas]);

  const proximaDeCualquierFrente = useMemo(() => {
    const fechas = (data?.frentes ?? FRENTES_LEGACY)
      .map((f) => data?.fronts?.[f.key]?.next?.date ?? null)
      /* La «próxima» de cada frente ya la resuelve el servidor (la siguiente agendada o la cargada
         a mano): acá solo importa si hay alguna. */
      .filter((d): d is string => !!d);
    return fechas.sort()[0] ?? null;
  }, [data]);

  const queSigue = useMemo(
    () =>
      data
        ? queSigueDelProyecto({
            etapa: data.etapa ?? null,
            piezas: resumenCtx.piezas,
            sesionesSinRevisar: sinRevisar,
            resumenPendiente:
              data.brief === null ? { motivo: null } : data.brief?.vencido ? { motivo: data.brief.motivoDeVencimiento } : null,
            proximaReunion: proximaDeCualquierFrente,
            etapaSugerida: data.etapaHubspot?.sugerencia ? { hasta: data.etapaHubspot.sugerencia.hasta } : null,
          })
        : null,
    [data, resumenCtx.piezas, sinRevisar, proximaDeCualquierFrente],
  );
  useEffect(() => {
    onQueSigue(queSigue);
  }, [queSigue, onQueSigue]);

  /* `?etapa=revisar` (lo manda «Para ti»): abre la encuesta de la etapa apenas llega la etapa, y
     saca el parámetro para que recargar no la vuelva a abrir. */
  const hayEncuesta = !!data?.etapaHubspot && !data.etapaHubspot.bloqueo;
  useEffect(() => {
    if (!hayEncuesta) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("etapa") !== "revisar") return;
    url.searchParams.delete("etapa");
    window.history.replaceState(window.history.state, "", url.toString());
    // eslint-disable-next-line react-hooks/set-state-in-effect -- abrir por enlace profundo, una vez
    setEncuestaAbierta(true);
  }, [hayEncuesta]);

  if (error) {
    return (
      <div className="lg:col-span-2">
        <Alert
          variant="danger"
          title="No se pudo cargar el resumen del proyecto"
          action={
            <BotonBlanco onClick={() => void fetchGPS()}>Reintentar</BotonBlanco>
          }
        >
          {error}
        </Alert>
      </div>
    );
  }

  // Skeleton ESTRUCTURAL: misma cáscara que lo cargado (la tarjeta de la etapa a todo el ancho y
  // la del resumen debajo). Vive en ./skeletons.tsx porque el loading.tsx pinta la MISMA pieza.
  if (!data) return <ProjectGpsSkeleton />;

  const formatDate = (d: Date) => {
    const days = calendarDaysFromToday(d);
    const dayMonth = d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    const timeStr = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    // Mostramos SIEMPRE la fecha agendada (no solo "Hoy/Mañana") para que no haya dudas.
    if (days === 0) return `Hoy ${dayMonth} · ${timeStr}`;
    if (days === 1) return `Mañana ${dayMonth} · ${timeStr}`;
    const full = d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
    return `${full} · ${timeStr}`;
  };
  const formatPastDate = (d: Date) => {
    const days = -calendarDaysFromToday(d);
    if (days <= 0) return "hoy";
    if (days === 1) return "ayer";
    if (days < 7) return `hace ${days} días`;
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  };

  const info = data.projectInfo;
  const createdAtStr = info?.createdAt
    ? new Date(info.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })
    : null;

  // Los frentes que este proyecto muestra, con su rótulo — los manda el servidor.
  const frentes = data.frentes ?? FRENTES_LEGACY;
  const cobertura = data.coberturaDelCliente ?? null;
  const pctTranscript = cobertura ? pctConTranscript(cobertura) : null;
  const etapa = data.etapa ?? null;
  const lineas = porQueEstaAca(etapa);
  const encuesta = data.etapaHubspot ?? null;

  // Pendientes: lo reciente (decisión del 2026-10-04). Respuestas cacheadas viejas no traen el
  // campo: ahí se cae a los abiertos de siempre.
  const recientes = data.pendientesRecientes ?? data.pendingItems.filter((i) => !i.done).slice(0, 5);
  const abiertosTotal = data.pendientesAbiertos ?? data.pendingItems.filter((i) => !i.done).length;
  // Lo que no se muestra, separado en recientes que no entraron y anteriores (no todo es «antiguo»).
  const recientesTotal = data.pendientesRecientes ? (data.pendientesRecientesTotal ?? null) : null;
  const resto = restoDeLosPendientes({ mostrados: recientes.length, recientes: recientesTotal, abiertos: abiertosTotal });

  const rotulo = "text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-fg-muted";
  const mixtaBadge = (
    <span className="rounded-full border border-line bg-surface-hover px-1.5 text-[10px] font-medium text-fg-secondary" title="La reunión mezcla a Ventas y al equipo de entrega">
      mixta
    </span>
  );

  // ── Última de un frente (Ventas / CSE / Desarrollo) ───────────────────────────
  const renderLastFront = (frontKey: FrontKey, label: string) => {
    const last = data.fronts?.[frontKey]?.last ?? null;
    const d = last?.date ? new Date(last.date) : null;
    return (
      <div className="flex flex-col gap-0.5 py-2">
        <span className="flex items-center gap-1.5 text-[11px] text-fg-muted">
          Última · {label} {last?.mixed && mixtaBadge}
        </span>
        {last && d ? (
          <>
            <span className="text-[13px] font-semibold text-fg">{formatPastDate(d)}</span>
            <span className="text-xs text-fg-secondary">
              {last.title && <span className="break-words">{last.title}</span>}
              {last.googleDocId && (
                <>
                  {last.title && " · "}
                  <a
                    href={`https://docs.google.com/document/d/${last.googleDocId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand hover:text-brand-light"
                  >
                    Abrir notas
                  </a>
                </>
              )}
            </span>
          </>
        ) : (
          <span className="text-[13px] text-fg-muted">Sin reuniones</span>
        )}
      </div>
    );
  };

  // ── Próxima de un frente — editable (una fecha cargada a mano, fuera de Meet) ──
  const renderNextFront = (frontKey: FrontKey, label: string) => {
    const next = data.fronts?.[frontKey]?.next ?? null;
    const d = next?.date ? new Date(next.date) : null;
    const editing = editingFront === frontKey;
    const isManual = next?.source === "manual";
    return (
      <div className="flex flex-col gap-0.5 py-2">
        <span className="flex items-center gap-1.5 text-[11px] text-fg-muted">
          Próxima · {label} {next?.mixed && mixtaBadge}
          {isManual && (
            <span className="rounded-full border border-line bg-surface-hover px-1.5 text-[10px] font-medium text-fg-secondary" title="Cargada a mano">
              a mano
            </span>
          )}
        </span>
        {editing ? (
          <div className="mt-1 space-y-1.5">
            <input
              ref={frontDateRef}
              type="datetime-local"
              aria-label={`Fecha de la próxima reunión de ${label}`}
              defaultValue={isManual && d ? new Date(d).toISOString().slice(0, 16) : ""}
              onChange={(e) => onFrontDate(frontKey, e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-2 py-1 text-xs text-fg focus:border-brand focus:outline-none"
            />
            <input
              defaultValue={isManual ? next?.note ?? "" : ""}
              placeholder="Nota (opcional)…"
              aria-label="Nota de la reunión"
              onChange={(e) => onFrontNote(frontKey, e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-2 py-1 text-xs text-fg focus:border-brand focus:outline-none"
            />
            <button onClick={() => setEditingFront(null)} className="text-xs font-semibold text-brand hover:text-brand-light">
              Listo
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              setEditingFront(frontKey);
              setTimeout(() => frontDateRef.current?.focus(), 50);
            }}
            title="Cargar o cambiar la fecha a mano"
            className="group w-full text-left"
          >
            {next && d ? (
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] font-semibold text-fg">{formatDate(d)}</span>
                {(next.title || next.note) && <span className="text-xs text-fg-secondary">{next.title ?? next.note}</span>}
              </span>
            ) : (
              <span className="text-[13px] text-fg-muted group-hover:text-fg-secondary">Sin agendar · cargar fecha</span>
            )}
          </button>
        )}
      </div>
    );
  };

  /* ── El panel de contexto (columna derecha) ──────────────────────────────────
     «Qué sigue», las reuniones, lo reciente de los pendientes y los datos del proyecto. Lo pinta
     el widget porque los datos son suyos; lo lleva por portal al panel que monta la ficha. */
  const accionDeQueSigue = (() => {
    const a = queSigue?.accion;
    if (!a) return undefined;
    if (a.tipo === "pieza") {
      return <BotonAzul onClick={() => resumenCtx.abrirPieza(a.slug)}>Abrir «{a.etiqueta}» →</BotonAzul>;
    }
    if (a.tipo === "agendar") {
      const entrega = frentes[frentes.length - 1];
      return entrega ? (
        <BotonAzul
          onClick={() => {
            setEditingFront(entrega.key);
            setTimeout(() => frontDateRef.current?.focus(), 50);
          }}
        >
          Cargar la próxima reunión
        </BotonAzul>
      ) : undefined;
    }
    if (a.tipo === "sesiones") return <BotonAzul onClick={() => setSesionesAbiertas(true)}>Revisar las reuniones</BotonAzul>;
    if (a.tipo === "etapa") return <BotonAzul onClick={() => setEncuestaAbierta(true)}>Responder la pregunta</BotonAzul>;
    return undefined;
  })();

  const panel = (
    <>
      {!resumenCtx.queSigueOcupado && queSigue && <QueSigue accion={accionDeQueSigue}>{queSigue.texto}</QueSigue>}

      <section className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <span className={rotulo}>Reuniones</span>
          <button onClick={() => setMinuteDialogOpen(true)} className="text-[11px] text-brand hover:text-brand-light" title="La minuta de la última reunión, generada por la IA">
            Ver minuta
          </button>
        </div>
        <div className="divide-y divide-line rounded-xl border border-line bg-surface px-3">
          {frentes.map((f) => (
            <div key={`next-${f.key}`}>{renderNextFront(f.key, f.label)}</div>
          ))}
          {frentes.map((f) => (
            <div key={`last-${f.key}`}>{renderLastFront(f.key, f.label)}</div>
          ))}
        </div>
        {/* D-08: la cobertura de transcripción de ESTE cliente. Sin reuniones pasadas no se pinta:
           un «0%» sobre cero reuniones sería una acusación sobre nada. */}
        {cobertura && pctTranscript !== null && (
          <span
            className="text-[11px] text-fg-muted"
            title={`Reuniones del cliente de los últimos ${cobertura.ventanaDias} días que dejaron transcripción. Lo que no se graba no alimenta ningún documento.`}
          >
            Con transcripción: <strong>{pctTranscript}%</strong> ({cobertura.conTranscript} de {cobertura.pasadas}, últimos 3 meses)
          </span>
        )}
      </section>

      <section className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <span className={rotulo}>Pendientes recientes · {recientesTotal ?? recientes.length}</span>
          <button onClick={() => setItemsDialogOpen(true)} className="text-[11px] text-brand hover:text-brand-light">
            {abiertosTotal > 0 ? `Ver los ${abiertosTotal}` : "Ver el histórico"}
          </button>
        </div>
        {recientes.length > 0 ? (
          <div className="divide-y divide-line rounded-xl border border-line bg-surface px-3">
            {recientes.map((item) => {
              const vence = item.dueDate ? new Date(item.dueDate) : null;
              const vencido = vence ? calendarDaysFromToday(vence) < 0 : false;
              const quien = item.responsableNombre ?? item.ladoResponsable ?? item.ownerEmail ?? null;
              return (
                <label key={item.id ?? item.text} className="flex items-start gap-2 py-2">
                  <input
                    type="checkbox"
                    aria-label="Marcar como hecho"
                    className="mt-[3px]"
                    onChange={() => item.id && toggleItem(item.id)}
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[13px] text-fg">{item.text}</span>
                    <span className="text-xs text-fg-muted">
                      {[
                        quien,
                        vence ? (
                          <span key="vence" className={vencido ? "text-warn-ink" : undefined}>
                            {vencido ? "venció el " : "para el "}
                            {vence.toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                          </span>
                        ) : (
                          "sin fecha"
                        ),
                      ]
                        .filter(Boolean)
                        .map((x, i) => (
                          <span key={i}>
                            {i > 0 && " · "}
                            {x}
                          </span>
                        ))}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <p className="text-[13px] text-fg-muted">Nada nuevo en las últimas 4 semanas.</p>
        )}
        {resto.texto && (
          <span className="text-[11px] text-fg-muted">
            {resto.texto}: están en «Ver los {abiertosTotal}».
          </span>
        )}
        <button onClick={() => setItemsDialogOpen(true)} className="self-start text-xs text-fg-muted transition-colors hover:text-fg">
          + Agregar pendiente
        </button>
      </section>

      {info && (info.name || info.cseEncargado || createdAtStr) && (
        <section className="flex flex-col gap-2.5">
          <span className={rotulo}>El proyecto</span>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-xl border border-line bg-surface px-3 py-2.5 text-[13px]">
            {info.cseEncargado && (
              <>
                <dt className="text-fg-muted">CSE</dt>
                <dd className="text-fg" title={info.cseEncargadoEmail ?? info.cseEncargado}>{info.cseEncargado}</dd>
              </>
            )}
            {info.pipelineName && (
              <>
                <dt className="text-fg-muted">Pipeline</dt>
                <dd className="text-fg">{info.pipelineName}</dd>
              </>
            )}
            {createdAtStr && (
              <>
                <dt className="text-fg-muted">Creado</dt>
                <dd className="text-fg">
                  {createdAtStr}
                  {info.createdAtSource === "nexus" && <span className="text-xs text-fg-muted"> · en Nexus</span>}
                </dd>
              </>
            )}
            {info.hubspotUrl && (
              <>
                <dt className="text-fg-muted">En HubSpot</dt>
                <dd>
                  <a href={info.hubspotUrl} target="_blank" rel="noopener noreferrer" className="text-brand hover:text-brand-light">
                    Abrir el proyecto ↗
                  </a>
                </dd>
              </>
            )}
          </dl>
        </section>
      )}
    </>
  );

  return (
    <div className="contents">
      {resumenCtx.slotDelPanel && createPortal(panel, resumenCtx.slotDelPanel)}

      {/* LA ETAPA, a todo el ancho del centro: dónde está el proyecto, la línea entera y qué
          falta para pasar a la siguiente. `#proyecto-etapa` es el ancla del enlace profundo del
          panel «Qué hacer acá» del cronograma; sin ella ese botón no lleva a ningún lado. */}
      <section className="scroll-mt-24 flex flex-col gap-3 rounded-xl border border-line bg-surface px-5 py-4 lg:col-span-2" id="proyecto-etapa" data-recorrido="ficha.etapa">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-2.5">
            <span className={rotulo}>Etapa</span>
            {etapa ? (
              <StageBadge
                stage={etapa.id}
                label={etapa.label}
                order={etapa.linea}
                stepperTitle={etapa.tituloDeLaLinea}
                source={etapa.curada ? "override" : "inferred"}
                reasons={etapa.razones}
                overrideReason={etapa.curadaPorque}
                size="titulo"
              />
            ) : data.currentState ? (
              <span className="text-[15px] font-semibold text-fg">{data.currentState}</span>
            ) : (
              /* Sin etapa y sin rótulo: no se afirma nada. Un «Etapa 1 → Análisis inicial»
                 inventado se lee como un dato del proyecto y no lo es. */
              <span className="text-[13px] text-fg-muted">Sin etapa registrada</span>
            )}
            {etapa?.posicion && (
              <span className="text-xs text-fg-muted">
                {etapa.posicion.index} de {etapa.posicion.total}
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-3">
            {/* Nexus → HubSpot: solo por la encuesta. HubSpot → Nexus: el espejo, como siempre. */}
            {encuesta && !encuesta.bloqueo && encuesta.opciones.length > 0 && (
              <BotonEnlace onClick={() => setEncuestaAbierta(true)}>Cambiar etapa</BotonEnlace>
            )}
            {info?.hubspotUrl && (
              <a href={info.hubspotUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand hover:text-brand-light">
                Ver en HubSpot ↗
              </a>
            )}
          </div>
        </div>
        {encuesta?.sugerencia && !encuesta.bloqueo && (
          <FranjaDeSugerencias acciones={<BotonBlanco onClick={() => setEncuestaAbierta(true)}>Ver y responder</BotonBlanco>}>
            Una reunión muestra que ya pasó a <strong className="font-semibold">{encuesta.sugerencia.hasta}</strong>
            {encuesta.sugerencia.reunion ? ` («${encuesta.sugerencia.reunion.titulo}»)` : ""}. En HubSpot sigue en{" "}
            {encuesta.sugerencia.desde ?? "otra etapa"}.
          </FranjaDeSugerencias>
        )}
        {etapa && etapa.linea.length > 0 && etapa.posicion && (
          <ol className="grid gap-1" style={{ gridTemplateColumns: `repeat(${etapa.linea.length}, minmax(0, 1fr))` }}>
            {etapa.linea.map((s, k) => {
              const i = etapa.posicion!.index - 1;
              return (
                <li key={s.id} className="flex min-w-0 flex-col gap-1.5">
                  <span className={`h-1.5 rounded-full ${k < i ? "bg-success" : k === i ? "bg-brand" : "bg-surface-active"}`} aria-hidden="true" />
                  <span className={`text-[11px] leading-[1.3] ${k < i ? "text-fg-secondary" : k === i ? "font-semibold text-brand" : "text-fg-muted"}`}>
                    {s.label}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        {lineas.length > 0 && (
          <div className="flex flex-col gap-1 border-t border-line pt-2.5 text-[13px] text-fg-secondary">
            {lineas.map((l, k) => (
              <span key={k}>
                {l.hecho ? <span className="font-bold text-success">✓</span> : <span className="text-fg-muted">○</span>} {l.texto}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* El resumen del proyecto: la respuesta a «cómo va esto». `undefined` (respuesta cacheada
          vieja) no pinta nada; `null` sí, porque «no hay resumen» es información y trae su CTA. */}
      {data.brief !== undefined && (
        <ProjectBriefSection projectId={projectId} brief={data.brief} onRefresh={fetchGPS} />
      )}

      <Modal open={sesionesAbiertas} onClose={() => setSesionesAbiertas(false)} title="Las reuniones de este proyecto" size="xl">
        <ProjectSessionsReview projectId={projectId} />
      </Modal>

      {minuteDialogOpen && <MinuteDialog projectId={projectId} onClose={() => setMinuteDialogOpen(false)} />}

      {encuesta && !encuesta.bloqueo && (
        <EncuestaDeEtapa
          projectId={projectId}
          proyecto={info?.name ?? "este proyecto"}
          etapa={encuesta}
          abierta={encuestaAbierta}
          puedeResponder={puedeMoverLaEtapa}
          onCerrar={() => setEncuestaAbierta(false)}
          onCambio={() => {
            invalidateGps(projectId);
            void fetchGPS();
          }}
        />
      )}

      <ActionItemsDialog
        open={itemsDialogOpen}
        onClose={() => setItemsDialogOpen(false)}
        items={data.pendingItems}
        history={data.historyItems ?? []}
        onToggle={toggleItem}
        onAdd={addItem}
        onRemove={removeItem}
        onRestore={restoreItem}
      />
    </div>
  );
}
