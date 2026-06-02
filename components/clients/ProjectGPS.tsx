"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import MinuteDialog from "./MinuteDialog";

interface PendingItem {
  id?: string;             // ActionItem.id (nuevo) — undefined si viene del Json viejo
  text: string;
  done: boolean;
  source?: string;
  addedAt?: string;
  // Nuevos campos del modelo ActionItem
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
  const [data, setData] = useState<GPSData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState(false);
  const [editingSummary, setEditingSummary] = useState(false);
  const [newItemText, setNewItemText] = useState("");
  const [minuteDialogOpen, setMinuteDialogOpen] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const fetchGPS = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/gps`);
      if (!res.ok) {
        // Intentar leer detalle del error sin asumir JSON
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    }
  }, [projectId]);

  useEffect(() => { fetchGPS(); }, [fetchGPS]);

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

  const toggleItem = async (index: number) => {
    if (!data) return;
    const item = data.pendingItems[index];
    const newDone = !item.done;

    // Optimistic UI
    const items = [...data.pendingItems];
    items[index] = { ...item, done: newDone, status: newDone ? "DONE" : "PENDING" };
    setData({ ...data, pendingItems: items });

    if (item.id) {
      await fetch(`/api/action-items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: newDone }),
      }).catch(() => fetchGPS());
    }
  };

  const addItem = async () => {
    if (!data || !newItemText.trim()) return;
    const text = newItemText.trim();
    setNewItemText("");
    const res = await fetch(`/api/action-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, clientId, projectId, source: "manual" }),
    });
    if (res.ok) {
      const created = await res.json();
      const newItem: PendingItem = {
        id: created.id,
        text,
        done: false,
        source: "manual",
        ownerEmail: null,
        dueDate: null,
        status: "PENDING",
        sessionId: null,
        sessionTitle: null,
      };
      setData({ ...data, pendingItems: [...data.pendingItems, newItem] });
    }
  };

  const removeItem = async (index: number) => {
    if (!data) return;
    const item = data.pendingItems[index];
    // Optimistic
    const items = data.pendingItems.filter((_, i) => i !== index);
    setData({ ...data, pendingItems: items });
    if (item.id) {
      await fetch(`/api/action-items/${item.id}`, { method: "DELETE" }).catch(() => fetchGPS());
    }
  };

  if (error) {
    return (
      <div className="mb-6 bg-red-900/10 border border-red-700/30 rounded-xl p-3 text-xs text-red-300 flex items-center justify-between gap-3">
        <span className="truncate" title={error}>⚠ No se pudo cargar el GPS: {error}</span>
        <button
          onClick={fetchGPS}
          className="flex-shrink-0 px-2.5 py-1 rounded bg-red-900/30 hover:bg-red-900/50 text-red-200 transition-colors font-medium"
        >
          Reintentar
        </button>
      </div>
    );
  }
  if (!data) return <div className="h-20 rounded-xl skeleton-shimmer mb-6" />;

  // Próxima sesión (priorizar la API enriquecida si existe)
  const nextSession = data.nextSession ?? {
    date: data.nextSessionDate,
    title: null,
    note: data.nextSessionNote,
    googleEventId: null,
    source: data.nextSessionDate ? ("manual" as const) : null,
  };
  const nextDate = nextSession.date ? new Date(nextSession.date) : null;
  const isUpcoming = nextDate && nextDate > new Date();
  const isPast = nextDate && nextDate <= new Date();

  // Última sesión (priorizar la API enriquecida si existe)
  const lastSession = data.lastSession ?? {
    date: null,
    title: null,
    summary: data.lastSessionSummary,
    googleDocId: null,
    source: data.lastSessionSummary ? ("manual" as const) : null,
  };
  const lastDate = lastSession.date ? new Date(lastSession.date) : null;

  const formatDate = (d: Date) => {
    const now = new Date();
    const diff = d.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const dateStr = d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
    const timeStr = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

    if (days === 0) return `Hoy · ${timeStr}`;
    if (days === 1) return `Mañana · ${timeStr}`;
    if (days < 7) return `${dateStr} · ${timeStr}`;
    return `${dateStr} · ${timeStr}`;
  };

  const formatPastDate = (d: Date) => {
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return "hoy";
    if (days === 1) return "ayer";
    if (days < 7) return `hace ${days} días`;
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  };

  const pendingCount = data.pendingItems.filter((i) => !i.done).length;

  const autoBadge = (
    <span className="text-[9px] uppercase tracking-wide text-gray-500 bg-gray-800/70 border border-gray-700 rounded px-1 py-0.5 ml-1">
      Auto
    </span>
  );

  // ── Project info row (HubSpot service properties) ──────────────────────────
  const info = data.projectInfo;
  const createdAtStr = info?.createdAt
    ? new Date(info.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <div className="mb-6 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Info bar del proyecto (desde HubSpot) */}
      {info && (info.name || info.pipelineName || info.cseEncargado || createdAtStr) && (
        <div className="flex items-center gap-4 flex-wrap px-4 py-2.5 bg-gray-950/50 border-b border-gray-800 text-xs">
          {info.name && (
            <div className="flex items-center gap-1.5 min-w-0">
              <svg className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2v3M9 12h6m-6 4h6" />
              </svg>
              <span className="text-gray-500">Proyecto:</span>
              <span className="text-gray-200 font-medium truncate" title={info.name}>{info.name}</span>
            </div>
          )}
          {info.pipelineName && (
            <div className="flex items-center gap-1.5 min-w-0">
              <svg className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
              </svg>
              <span className="text-gray-500">Pipeline:</span>
              <span className="text-gray-200 truncate" title={info.pipelineName}>{info.pipelineName}</span>
            </div>
          )}
          {info.cseEncargado && (
            <div className="flex items-center gap-1.5 min-w-0">
              <svg className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-gray-500">CSE encargado:</span>
              <span
                className="text-gray-200 truncate"
                title={info.cseEncargadoEmail ? `${info.cseEncargado} · ${info.cseEncargadoEmail}` : info.cseEncargado}
              >
                {info.cseEncargado}
              </span>
            </div>
          )}
          {createdAtStr && (
            <div className="flex items-center gap-1.5 min-w-0 ml-auto">
              <svg className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-gray-500">Creado:</span>
              <span className="text-gray-200">{createdAtStr}</span>
              {info.createdAtSource === "nexus" && (
                <span className="text-[9px] text-gray-600 uppercase tracking-wider">en Nexus</span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-4 divide-x divide-gray-800">
        {/* Última sesión (PRIMERA — orden invertido para que lo más fresco esté a la izq) */}
        <div className="p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Última sesión</span>
            {lastSession.source === "auto" && autoBadge}
          </div>

          {/* CTA prominente: abrir minuta en modal */}
          <button
            onClick={() => setMinuteDialogOpen(true)}
            className="w-full mb-2 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-brand text-white text-xs font-semibold hover:bg-brand/90 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Ver minuta
          </button>

          {editingSummary ? (
            <div className="space-y-1.5">
              <textarea
                autoFocus
                rows={2}
                defaultValue={data.lastSessionSummary ?? ""}
                onChange={(e) => {
                  setData({ ...data, lastSessionSummary: e.target.value });
                  debouncedSave("lastSessionSummary", e.target.value);
                }}
                className="w-full text-xs border border-gray-700 rounded px-2 py-1 focus:outline-none focus:border-brand resize-none bg-gray-800 text-gray-200"
              />
              <button onClick={() => setEditingSummary(false)} className="text-[10px] text-brand hover:text-brand/80">
                Listo
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditingSummary(true)}
              className="text-left w-full"
            >
              {lastSession.title || lastSession.summary ? (
                <div>
                  {lastSession.title && (
                    <p className="text-xs font-medium text-gray-200 truncate" title={lastSession.title}>
                      {lastSession.title}
                    </p>
                  )}
                  {lastDate && (
                    <p className="text-[10px] text-gray-500 mt-0.5">{formatPastDate(lastDate)}</p>
                  )}
                  {lastSession.summary && (
                    <p className="text-xs text-gray-300 line-clamp-2 mt-1">{lastSession.summary}</p>
                  )}
                  {lastSession.googleDocId && (
                    <a
                      href={`https://docs.google.com/document/d/${lastSession.googleDocId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px] text-brand hover:text-brand/80 mt-1 inline-block"
                    >
                      Abrir notas →
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-300 hover:text-gray-400 transition-colors">Sin sesiones procesadas</p>
              )}
            </button>
          )}
        </div>

        {/* Próxima sesión */}
        <div className="p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Próxima sesión</span>
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
                  setData({ ...data, nextSessionDate: val });
                  saveField("nextSessionDate", val);
                }}
                className="w-full text-xs border border-gray-700 rounded px-2 py-1 focus:outline-none focus:border-brand bg-gray-800 text-gray-200"
              />
              <input
                defaultValue={data.nextSessionNote ?? ""}
                placeholder="Nota (opcional)..."
                onChange={(e) => {
                  setData({ ...data, nextSessionNote: e.target.value });
                  debouncedSave("nextSessionNote", e.target.value);
                }}
                className="w-full text-xs border border-gray-700 rounded px-2 py-1 focus:outline-none focus:border-brand bg-gray-800 text-gray-200"
              />
              <button
                onClick={() => setEditingSession(false)}
                className="text-[10px] text-brand hover:text-brand/80"
              >
                Listo
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setEditingSession(true); setTimeout(() => dateInputRef.current?.focus(), 50); }}
              className="text-left w-full group"
            >
              {nextDate ? (
                <div>
                  <p className={`text-sm font-medium ${isUpcoming ? "text-white" : "text-red-400"}`}>
                    {formatDate(nextDate)}
                  </p>
                  {nextSession.title && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate" title={nextSession.title}>
                      {nextSession.title}
                    </p>
                  )}
                  {nextSession.note && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{nextSession.note}</p>
                  )}
                  {isPast && <p className="text-[10px] text-red-400 mt-0.5">Pasada</p>}
                </div>
              ) : (
                <p className="text-xs text-gray-300 group-hover:text-gray-400 transition-colors">
                  Sin sesión agendada
                </p>
              )}
            </button>
          )}
        </div>

        {/* Estado actual */}
        <div className="p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Estado actual</span>
          </div>
          <p className="text-sm font-medium text-white">{data.currentState}</p>
        </div>

        {/* Pendientes */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                Pendientes{pendingCount > 0 ? ` (${pendingCount})` : ""}
              </span>
            </div>
          </div>
          <div className="space-y-1 max-h-24 overflow-y-auto">
            {data.pendingItems.map((item, i) => (
              <div key={i} className="flex items-start gap-1.5 group">
                <button
                  onClick={() => toggleItem(i)}
                  className={`mt-0.5 w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                    item.done ? "bg-green-500 border-green-500" : "border-gray-600 hover:border-gray-500"
                  }`}
                >
                  {item.done && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <span
                    className={`text-xs block ${item.done ? "line-through text-gray-500" : "text-gray-300"}`}
                    title={item.source ? `Generado por: ${item.source}` : undefined}
                  >
                    {item.text}
                  </span>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {item.sessionId && item.sessionTitle && !item.done && (
                      <Link
                        href={`/sessions/${item.sessionId}`}
                        className="text-[9px] text-brand hover:underline truncate"
                        title={`De la reunión: ${item.sessionTitle}`}
                      >
                        ↗ {item.sessionTitle}
                      </Link>
                    )}
                    {item.ownerEmail && !item.done && (
                      <span className="text-[9px] text-gray-600">@{item.ownerEmail.split("@")[0]}</span>
                    )}
                    {item.dueDate && !item.done && (
                      <span className="text-[9px] text-gray-600">
                        vence {new Date(item.dueDate).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                      </span>
                    )}
                    {!item.sessionId && item.source && !item.done && (
                      <span className="text-[9px] text-gray-600 truncate">↑ {item.source}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => removeItem(i)}
                  className="text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); addItem(); }} className="mt-1.5">
            <input
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              placeholder="+ Agregar..."
              className="w-full text-xs text-gray-400 placeholder-gray-300 border-0 bg-transparent focus:outline-none focus:text-gray-600"
            />
          </form>
        </div>
      </div>

      {/* Dialog modal de la minuta + tab Participantes + CTA Historial */}
      {minuteDialogOpen && (
        <MinuteDialog
          projectId={projectId}
          onClose={() => setMinuteDialogOpen(false)}
        />
      )}
    </div>
  );
}
