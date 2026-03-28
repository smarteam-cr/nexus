"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface PendingItem {
  text: string;
  done: boolean;
}

interface GPSData {
  nextSessionDate: string | null;
  nextSessionNote: string | null;
  lastSessionSummary: string | null;
  pendingItems: PendingItem[];
  currentState: string;
}

export default function ProjectGPS({ projectId }: { projectId: string }) {
  const [data, setData] = useState<GPSData | null>(null);
  const [editingSession, setEditingSession] = useState(false);
  const [editingSummary, setEditingSummary] = useState(false);
  const [newItemText, setNewItemText] = useState("");
  const dateInputRef = useRef<HTMLInputElement>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>();

  const fetchGPS = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/gps`);
      const d = await res.json();
      setData(d);
    } catch { /* ignore */ }
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

  const toggleItem = (index: number) => {
    if (!data) return;
    const items = [...data.pendingItems];
    items[index] = { ...items[index], done: !items[index].done };
    setData({ ...data, pendingItems: items });
    saveField("pendingItems", items);
  };

  const addItem = () => {
    if (!data || !newItemText.trim()) return;
    const items = [...data.pendingItems, { text: newItemText.trim(), done: false }];
    setData({ ...data, pendingItems: items });
    setNewItemText("");
    saveField("pendingItems", items);
  };

  const removeItem = (index: number) => {
    if (!data) return;
    const items = data.pendingItems.filter((_, i) => i !== index);
    setData({ ...data, pendingItems: items });
    saveField("pendingItems", items);
  };

  if (!data) return <div className="h-20 bg-gray-50 rounded-xl animate-pulse mb-6" />;

  const nextDate = data.nextSessionDate ? new Date(data.nextSessionDate) : null;
  const isUpcoming = nextDate && nextDate > new Date();
  const isPast = nextDate && nextDate <= new Date();

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

  const pendingCount = data.pendingItems.filter((i) => !i.done).length;

  return (
    <div className="mb-6 bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="grid grid-cols-4 divide-x divide-gray-100">
        {/* Próxima sesión */}
        <div className="p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Próxima sesión</span>
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
                className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400"
              />
              <input
                defaultValue={data.nextSessionNote ?? ""}
                placeholder="Nota (opcional)..."
                onChange={(e) => {
                  setData({ ...data, nextSessionNote: e.target.value });
                  debouncedSave("nextSessionNote", e.target.value);
                }}
                className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400"
              />
              <button
                onClick={() => setEditingSession(false)}
                className="text-[10px] text-blue-500 hover:text-blue-700"
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
                  <p className={`text-sm font-medium ${isUpcoming ? "text-gray-900" : "text-red-500"}`}>
                    {formatDate(nextDate)}
                  </p>
                  {data.nextSessionNote && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{data.nextSessionNote}</p>
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

        {/* Última sesión */}
        <div className="p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Última sesión</span>
          </div>
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
                className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400 resize-none"
              />
              <button onClick={() => setEditingSummary(false)} className="text-[10px] text-blue-500 hover:text-blue-700">
                Listo
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditingSummary(true)}
              className="text-left w-full"
            >
              {data.lastSessionSummary ? (
                <p className="text-xs text-gray-600 line-clamp-3">{data.lastSessionSummary}</p>
              ) : (
                <p className="text-xs text-gray-300 hover:text-gray-400 transition-colors">Sin sesiones procesadas</p>
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
          <p className="text-sm font-medium text-gray-900">{data.currentState}</p>
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
                    item.done ? "bg-green-500 border-green-500" : "border-gray-300 hover:border-gray-400"
                  }`}
                >
                  {item.done && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <span className={`text-xs flex-1 ${item.done ? "line-through text-gray-300" : "text-gray-600"}`}>
                  {item.text}
                </span>
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
    </div>
  );
}
