"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import MinuteDialog from "./MinuteDialog";
import ActionItemsDialog from "./ActionItemsDialog";
import { useWorkspace } from "./WorkspaceContext";
import { useToast } from "@/components/ui/Toast";
import { readGpsCache, writeGpsCache, invalidateGps } from "@/lib/clients/gps-cache";
import { calendarDaysFromToday } from "@/lib/utils/relative-date";

export interface PendingItem {
  id?: string;             // ActionItem.id (nuevo) — undefined si viene del Json viejo
  text: string;
  done: boolean;
  source?: string;
  addedAt?: string;
  // Campos del modelo ActionItem
  ownerEmail?: string | null;
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

// Frente (Ventas / CS) ya resuelto: próxima-agendada o, si no hay, la última-pasada.
// isUpcoming distingue una de la otra; source si es manual (ajena a meets) o auto.
interface FrontResolved {
  date: string;
  title: string | null;
  note: string | null;
  isUpcoming: boolean;
  mixed: boolean;
  googleDocId: string | null;
  googleEventId: string | null;
  source: "manual" | "auto";
}

interface ProjectInfo {
  name: string | null;
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
  currentState: string;

  // Enriquecidos (nueva API)
  nextSession?: NextSessionInfo;
  lastSession?: LastSessionInfo;
  fronts?: { ventas: FrontResolved | null; cs: FrontResolved | null };
  projectInfo?: ProjectInfo;
  historyItems?: PendingItem[]; // tareas hechas o borradas (tab Histórico del modal)
}

type FrontKey = "ventas" | "cs";

// Campos del Project (PUT) donde se persiste el override manual de cada frente.
const FRONT_FIELDS: Record<FrontKey, { date: string; note: string }> = {
  ventas: { date: "salesNextSessionDate", note: "salesNextSessionNote" },
  cs: { date: "csNextSessionDate", note: "csNextSessionNote" },
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
      if (!res.ok) toast.error("No se pudo guardar el cambio del GPS.");
    } catch {
      toast.error("No se pudo guardar el cambio del GPS. Revisá tu conexión.");
    }
  }, [projectId, toast]);

  const debouncedSave = useCallback((field: string, value: unknown) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => saveField(field, value), 500);
  }, [saveField]);

  // ── Edición manual de la PRÓXIMA por frente (reuniones ajenas a meets) ────────
  // Optimista: actualiza el frente local como "manual" y persiste. Si se limpia la
  // fecha, refetch para que vuelva a resolver la sesión auto-detectada.
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
      const prev = cur.fronts?.[frontKey];
      const newFront: FrontResolved = {
        date: iso,
        title: null,
        note: prev?.source === "manual" ? prev.note : null,
        isUpcoming: new Date(iso).getTime() > Date.now(),
        mixed: false,
        googleDocId: null,
        googleEventId: null,
        source: "manual",
      };
      const fronts = { ventas: cur.fronts?.ventas ?? null, cs: cur.fronts?.cs ?? null };
      fronts[frontKey] = newFront;
      const next: GPSData = { ...cur, fronts };
      writeGpsCache(projectId, next);
      return next;
    });
  }, [projectId, saveField, fetchGPS]);

  const onFrontNote = useCallback((frontKey: FrontKey, value: string) => {
    debouncedSave(FRONT_FIELDS[frontKey].note, value || null);
    setData((cur) => {
      if (!cur) return cur;
      const prev = cur.fronts?.[frontKey];
      if (!prev) return cur; // la nota solo aplica con una próxima manual ya seteada
      const fronts = { ventas: cur.fronts?.ventas ?? null, cs: cur.fronts?.cs ?? null };
      fronts[frontKey] = { ...prev, note: value || null, source: "manual" };
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

  if (error) {
    return (
      <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-500 flex items-center justify-between gap-3">
        <span className="truncate" title={error}>⚠ No se pudo cargar el GPS: {error}</span>
        <button
          onClick={fetchGPS}
          className="flex-shrink-0 px-2.5 py-1 rounded bg-red-500/15 hover:bg-red-500/25 text-red-600 transition-colors font-medium"
        >
          Reintentar
        </button>
      </div>
    );
  }

  // Skeleton ESTRUCTURAL: misma cáscara/altura que el widget cargado (cabecera +
  // grid de 4 columnas) para que al cargar no haya salto de scroll.
  if (!data) {
    const cell = (
      <div className="p-4 space-y-2.5">
        <div className="h-2.5 w-14 rounded skeleton-shimmer" />
        <div className="h-4 w-24 rounded skeleton-shimmer" />
        <div className="h-3 w-20 rounded skeleton-shimmer" />
        <div className="h-3 w-12 rounded skeleton-shimmer" />
      </div>
    );
    return (
      <div className="mb-6 bg-surface border border-line rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-surface-muted border-b border-line">
          <div className="h-4 w-64 max-w-full rounded skeleton-shimmer" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-line min-h-[132px]">
          {cell}{cell}{cell}{cell}
        </div>
      </div>
    );
  }

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

  const pendingOpen = data.pendingItems.filter((i) => !i.done);
  const pendingCount = pendingOpen.length;

  const info = data.projectInfo;
  const createdAtStr = info?.createdAt
    ? new Date(info.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })
    : null;

  const cardLabel = "text-[10px] font-semibold text-fg-muted uppercase tracking-wide";

  // ── Render de un frente (Ventas / CS) ─────────────────────────────────────────
  const renderFront = (frontKey: FrontKey, label: string, fullLabel: string) => {
    const front = data.fronts?.[frontKey] ?? null;
    const fdate = front?.date ? new Date(front.date) : null;
    const editing = editingFront === frontKey;
    const isManual = front?.source === "manual";
    return (
      <div className="p-4 flex flex-col">
        <div className="flex items-center gap-1.5 mb-2">
          <span className={cardLabel} title={fullLabel}>{label}</span>
          {front?.mixed && (
            <span className="text-[9px] uppercase tracking-wide text-brand bg-brand/10 border border-brand/30 rounded px-1 py-0.5">mixta</span>
          )}
          {isManual && (
            <span className="text-[9px] uppercase tracking-wide text-fg-muted bg-surface-muted border border-line rounded px-1 py-0.5">manual</span>
          )}
        </div>
        {editing ? (
          <div className="space-y-1.5">
            <input
              ref={frontDateRef}
              type="datetime-local"
              defaultValue={isManual && fdate ? new Date(fdate).toISOString().slice(0, 16) : ""}
              onChange={(e) => onFrontDate(frontKey, e.target.value)}
              className="w-full text-xs border border-line rounded px-2 py-1 focus:outline-none focus:border-brand bg-surface-muted text-fg"
            />
            <input
              defaultValue={isManual ? front?.note ?? "" : ""}
              placeholder="Nota (opcional)…"
              onChange={(e) => onFrontNote(frontKey, e.target.value)}
              className="w-full text-xs border border-line rounded px-2 py-1 focus:outline-none focus:border-brand bg-surface-muted text-fg"
            />
            <button onClick={() => setEditingFront(null)} className="text-[10px] text-brand hover:text-brand/80">Listo</button>
          </div>
        ) : (
          <button
            onClick={() => { setEditingFront(frontKey); setTimeout(() => frontDateRef.current?.focus(), 50); }}
            className="text-left w-full group"
          >
            {front && fdate ? (
              <div>
                <p className={`text-sm font-medium ${front.isUpcoming ? "text-fg" : "text-fg-secondary"}`}>
                  {front.isUpcoming ? formatDate(fdate) : formatPastDate(fdate)}
                </p>
                {front.title && <p className="text-xs text-fg-muted mt-0.5 truncate" title={front.title}>{front.title}</p>}
                {front.note && <p className="text-xs text-fg-muted mt-0.5 truncate">{front.note}</p>}
                <p className={`text-[10px] mt-0.5 ${front.isUpcoming ? "text-brand" : "text-fg-muted"}`}>
                  {front.isUpcoming ? "Próxima" : "Última"}
                </p>
                {!front.isUpcoming && front.googleDocId && (
                  <a
                    href={`https://docs.google.com/document/d/${front.googleDocId}`}
                    target="_blank" rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[10px] text-brand hover:text-brand/80 mt-1 inline-block"
                  >
                    Abrir notas →
                  </a>
                )}
              </div>
            ) : (
              <p className="text-xs text-fg-muted group-hover:text-fg-secondary transition-colors">
                Sin sesiones de {label.toLowerCase()}
              </p>
            )}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="mb-6 bg-surface border border-line rounded-xl overflow-hidden">
      {/* Cabecera: info del proyecto (HubSpot) + Ver minuta */}
      <div className="flex items-center gap-4 flex-wrap px-4 py-2.5 bg-surface-muted border-b border-line text-xs">
        {info?.name && (
          <span className="min-w-0 truncate">
            <span className="text-fg-muted">Proyecto: </span>
            <span className="text-fg font-medium" title={info.name}>{info.name}</span>
          </span>
        )}
        {info?.pipelineName && (
          <span className="min-w-0 truncate">
            <span className="text-fg-muted">Pipeline: </span>
            <span className="text-fg-secondary" title={info.pipelineName}>{info.pipelineName}</span>
          </span>
        )}
        {info?.cseEncargado && (
          <span className="min-w-0 truncate">
            <span className="text-fg-muted">CSE: </span>
            <span className="text-fg-secondary" title={info.cseEncargadoEmail ?? info.cseEncargado}>{info.cseEncargado}</span>
          </span>
        )}
        {createdAtStr && (
          <span className="min-w-0 truncate">
            <span className="text-fg-muted">Creado: </span>
            <span className="text-fg-secondary">{createdAtStr}</span>
            {info?.createdAtSource === "nexus" && (
              <span className="text-[9px] text-fg-muted uppercase tracking-wider ml-1">en Nexus</span>
            )}
          </span>
        )}
        <button
          onClick={() => setMinuteDialogOpen(true)}
          className="ml-auto flex-shrink-0 text-xs font-semibold text-brand hover:text-brand/80 transition-colors"
          title="Ver minuta generada por la IA"
        >
          Ver minuta
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-line min-h-[132px]">
        {/* Frente Ventas */}
        {renderFront("ventas", "Ventas", "Sesiones de Ventas")}

        {/* Frente CS (entrega de servicio) */}
        {renderFront("cs", "CS", "Entrega de servicio (CS)")}

        {/* Estado actual */}
        <div className="p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <span className={cardLabel}>Estado actual</span>
          </div>
          <p className="text-sm font-medium text-fg">{data.currentState}</p>
        </div>

        {/* Pendientes — resumen + botón al dialog central */}
        <div className="p-4 flex flex-col">
          <div className="flex items-center gap-1.5 mb-2">
            <span className={cardLabel}>Pendientes{pendingCount > 0 ? ` (${pendingCount})` : ""}</span>
          </div>
          {pendingCount > 0 ? (
            <ul className="space-y-1 mb-2">
              {pendingOpen.slice(0, 2).map((item, i) => (
                <li key={i} className="text-xs text-fg-secondary truncate flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-fg-muted flex-shrink-0" />
                  <span className="truncate">{item.text}</span>
                </li>
              ))}
              {pendingCount > 2 && <li className="text-[10px] text-fg-muted">+{pendingCount - 2} más</li>}
            </ul>
          ) : (
            <p className="text-xs text-fg-muted mb-2">Sin pendientes</p>
          )}
          <button
            onClick={() => setItemsDialogOpen(true)}
            className="mt-auto text-xs font-semibold text-brand hover:text-brand/80 self-start transition-colors"
          >
            {pendingCount > 0 ? "Ver todos" : "Agregar pendiente"}
          </button>
        </div>
      </div>

      {minuteDialogOpen && <MinuteDialog projectId={projectId} onClose={() => setMinuteDialogOpen(false)} />}

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
