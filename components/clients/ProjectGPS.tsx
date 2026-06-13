"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import MinuteDialog from "./MinuteDialog";
import ActionItemsDialog from "./ActionItemsDialog";
import { useWorkspace } from "./WorkspaceContext";
import { readGpsCache, writeGpsCache, isGpsStale, invalidateGps } from "@/lib/clients/gps-cache";

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
  projectInfo?: ProjectInfo;
}

export default function ProjectGPS({ projectId, clientId }: { projectId: string; clientId: string }) {
  // Inicializa desde el cache de módulo → al remontar (cambio de tab) renderiza al
  // instante, sin recarga. (Ver lib/clients/gps-cache.ts)
  const { gpsRefreshSignal } = useWorkspace();
  const [data, setData] = useState<GPSData | null>(() => readGpsCache<GPSData>(projectId)?.data ?? null);
  const [error, setError] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState(false);
  const [editingSummary, setEditingSummary] = useState(false);
  const [minuteDialogOpen, setMinuteDialogOpen] = useState(false);
  const [itemsDialogOpen, setItemsDialogOpen] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // setData + persistir en cache (una sola fuente de verdad que sobrevive al remonte).
  const commit = useCallback((next: GPSData) => {
    setData(next);
    writeGpsCache(projectId, next);
  }, [projectId]);

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

  // Montaje: SOLO fetch si no hay cache fresco → cambiar de tab no recarga el widget.
  useEffect(() => {
    const c = readGpsCache<GPSData>(projectId);
    if (!c || isGpsStale(c.fetchedAt)) fetchGPS();
  }, [projectId, fetchGPS]);

  // Sesión nueva detectada (auto-sync de Meet bumpea la señal) → refetch forzado.
  const firstSignalRef = useRef(true);
  useEffect(() => {
    if (firstSignalRef.current) { firstSignalRef.current = false; return; }
    invalidateGps(projectId);
    fetchGPS();
  }, [gpsRefreshSignal, projectId, fetchGPS]);

  const saveField = useCallback(async (field: string, value: unknown) => {
    await fetch(`/api/projects/${projectId}/gps`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    }).catch(() => {});
  }, [projectId]);

  const debouncedSave = useCallback((field: string, value: unknown) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => saveField(field, value), 500);
  }, [saveField]);

  // ── Mutaciones de pendientes (compartidas con el dialog) ──────────────────────
  const toggleItem = useCallback(async (index: number) => {
    setData((cur) => {
      if (!cur) return cur;
      const item = cur.pendingItems[index];
      const newDone = !item.done;
      const items = [...cur.pendingItems];
      items[index] = { ...item, done: newDone, status: newDone ? "DONE" : "PENDING" };
      const next = { ...cur, pendingItems: items };
      writeGpsCache(projectId, next);
      if (item.id) {
        fetch(`/api/action-items/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ done: newDone }),
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

  const removeItem = useCallback(async (index: number) => {
    setData((cur) => {
      if (!cur) return cur;
      const item = cur.pendingItems[index];
      const next = { ...cur, pendingItems: cur.pendingItems.filter((_, i) => i !== index) };
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
  if (!data) return <div className="h-20 rounded-xl skeleton-shimmer mb-6" />;

  // Próxima sesión (priorizar la API enriquecida si existe)
  const nextSession = data.nextSession ?? {
    date: data.nextSessionDate, title: null, note: data.nextSessionNote,
    googleEventId: null, source: data.nextSessionDate ? ("manual" as const) : null,
  };
  const nextDate = nextSession.date ? new Date(nextSession.date) : null;
  const isUpcoming = nextDate && nextDate > new Date();
  const isPast = nextDate && nextDate <= new Date();

  // Última sesión (priorizar la API enriquecida si existe)
  const lastSession = data.lastSession ?? {
    date: null, title: null, summary: data.lastSessionSummary,
    googleDocId: null, source: data.lastSessionSummary ? ("manual" as const) : null,
  };
  const lastDate = lastSession.date ? new Date(lastSession.date) : null;

  const formatDate = (d: Date) => {
    const days = Math.floor((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const dateStr = d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
    const timeStr = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    if (days === 0) return `Hoy · ${timeStr}`;
    if (days === 1) return `Mañana · ${timeStr}`;
    return `${dateStr} · ${timeStr}`;
  };
  const formatPastDate = (d: Date) => {
    const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return "hoy";
    if (days === 1) return "ayer";
    if (days < 7) return `hace ${days} días`;
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  };

  const pendingOpen = data.pendingItems.filter((i) => !i.done);
  const pendingCount = pendingOpen.length;

  const autoBadge = (
    <span className="text-[9px] uppercase tracking-wide text-fg-muted bg-surface-muted border border-line rounded px-1 py-0.5 ml-1">
      Auto
    </span>
  );

  const info = data.projectInfo;
  const createdAtStr = info?.createdAt
    ? new Date(info.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })
    : null;

  const cardLabel = "text-[10px] font-semibold text-fg-muted uppercase tracking-wide";

  return (
    <div className="mb-6 bg-surface border border-line rounded-xl overflow-hidden">
      {/* Info bar del proyecto (desde HubSpot) */}
      {info && (info.name || info.pipelineName || info.cseEncargado || createdAtStr) && (
        <div className="flex items-center gap-4 flex-wrap px-4 py-2.5 bg-surface-muted border-b border-line text-xs">
          {info.name && (
            <span className="min-w-0 truncate">
              <span className="text-fg-muted">Proyecto: </span>
              <span className="text-fg font-medium" title={info.name}>{info.name}</span>
            </span>
          )}
          {info.pipelineName && (
            <span className="min-w-0 truncate">
              <span className="text-fg-muted">Pipeline: </span>
              <span className="text-fg-secondary" title={info.pipelineName}>{info.pipelineName}</span>
            </span>
          )}
          {info.cseEncargado && (
            <span className="min-w-0 truncate">
              <span className="text-fg-muted">CSE: </span>
              <span className="text-fg-secondary" title={info.cseEncargadoEmail ?? info.cseEncargado}>{info.cseEncargado}</span>
            </span>
          )}
          {createdAtStr && (
            <span className="min-w-0 truncate ml-auto">
              <span className="text-fg-muted">Creado: </span>
              <span className="text-fg-secondary">{createdAtStr}</span>
              {info.createdAtSource === "nexus" && (
                <span className="text-[9px] text-fg-muted uppercase tracking-wider ml-1">en Nexus</span>
              )}
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-line">
        {/* Última sesión */}
        <div className="p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <span className={cardLabel}>Última sesión</span>
            {lastSession.source === "auto" && autoBadge}
            <button
              onClick={() => setMinuteDialogOpen(true)}
              className="ml-auto text-[10px] font-semibold text-brand hover:text-brand/80 bg-brand/10 hover:bg-brand/20 border border-brand/30 rounded px-1.5 py-0.5 transition-colors"
              title="Ver minuta generada por la IA"
            >
              Ver minuta
            </button>
          </div>
          {editingSummary ? (
            <div className="space-y-1.5">
              <textarea
                autoFocus
                rows={2}
                defaultValue={data.lastSessionSummary ?? ""}
                onChange={(e) => {
                  commit({ ...data, lastSessionSummary: e.target.value });
                  debouncedSave("lastSessionSummary", e.target.value);
                }}
                className="w-full text-xs border border-line rounded px-2 py-1 focus:outline-none focus:border-brand resize-none bg-surface-muted text-fg"
              />
              <button onClick={() => setEditingSummary(false)} className="text-[10px] text-brand hover:text-brand/80">Listo</button>
            </div>
          ) : (
            <button onClick={() => setEditingSummary(true)} className="text-left w-full">
              {lastSession.title || lastSession.summary ? (
                <div>
                  {lastSession.title && (
                    <p className="text-xs font-medium text-fg truncate" title={lastSession.title}>{lastSession.title}</p>
                  )}
                  {lastDate && <p className="text-[10px] text-fg-muted mt-0.5">{formatPastDate(lastDate)}</p>}
                  {lastSession.summary && <p className="text-xs text-fg-secondary line-clamp-2 mt-1">{lastSession.summary}</p>}
                  {lastSession.googleDocId && (
                    <a
                      href={`https://docs.google.com/document/d/${lastSession.googleDocId}`}
                      target="_blank" rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px] text-brand hover:text-brand/80 mt-1 inline-block"
                    >
                      Abrir notas →
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-xs text-fg-muted">Sin sesiones procesadas</p>
              )}
            </button>
          )}
        </div>

        {/* Próxima sesión */}
        <div className="p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <span className={cardLabel}>Próxima sesión</span>
            {nextSession.source === "auto" && autoBadge}
          </div>
          {editingSession ? (
            <div className="space-y-1.5">
              <input
                ref={dateInputRef}
                type="datetime-local"
                defaultValue={data.nextSessionDate ? new Date(data.nextSessionDate).toISOString().slice(0, 16) : ""}
                onChange={(e) => {
                  const val = e.target.value ? new Date(e.target.value).toISOString() : null;
                  commit({ ...data, nextSessionDate: val });
                  saveField("nextSessionDate", val);
                }}
                className="w-full text-xs border border-line rounded px-2 py-1 focus:outline-none focus:border-brand bg-surface-muted text-fg"
              />
              <input
                defaultValue={data.nextSessionNote ?? ""}
                placeholder="Nota (opcional)…"
                onChange={(e) => {
                  commit({ ...data, nextSessionNote: e.target.value });
                  debouncedSave("nextSessionNote", e.target.value);
                }}
                className="w-full text-xs border border-line rounded px-2 py-1 focus:outline-none focus:border-brand bg-surface-muted text-fg"
              />
              <button onClick={() => setEditingSession(false)} className="text-[10px] text-brand hover:text-brand/80">Listo</button>
            </div>
          ) : (
            <button
              onClick={() => { setEditingSession(true); setTimeout(() => dateInputRef.current?.focus(), 50); }}
              className="text-left w-full group"
            >
              {nextDate ? (
                <div>
                  <p className={`text-sm font-medium ${isUpcoming ? "text-fg" : "text-red-500"}`}>{formatDate(nextDate)}</p>
                  {nextSession.title && <p className="text-xs text-fg-muted mt-0.5 truncate" title={nextSession.title}>{nextSession.title}</p>}
                  {nextSession.note && <p className="text-xs text-fg-muted mt-0.5 truncate">{nextSession.note}</p>}
                  {isPast && <p className="text-[10px] text-red-500 mt-0.5">Pasada</p>}
                </div>
              ) : (
                <p className="text-xs text-fg-muted group-hover:text-fg-secondary transition-colors">Sin sesión agendada</p>
              )}
            </button>
          )}
        </div>

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
            className="mt-auto text-xs font-medium text-brand hover:text-brand/80 self-start"
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
        onToggle={toggleItem}
        onAdd={addItem}
        onRemove={removeItem}
      />
    </div>
  );
}
