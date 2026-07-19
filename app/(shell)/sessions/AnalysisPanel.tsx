"use client";

/**
 * AnalysisPanel — Panel derecho del hub /sessions cuando está en modo "análisis".
 *
 * Permite al consultor:
 *   - Ver lista de análisis previos del Client.
 *   - Configurar y ejecutar un nuevo análisis (agente + filtros).
 *   - Ver el output de un análisis (cards renderizadas).
 *
 * Solo funciona con Clients de Nexus (no empresas HubSpot ni categorías).
 * Esa restricción la maneja el caller (SessionsClient).
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface SessionLite {
  id: string;
  title: string;
  date: string;
  participants: string[];
  hasTranscript: boolean;
  /** PERF: booleano computado server-side — el blob `summary` ya no viaja en la lista. */
  hasSummary: boolean;
}

interface TeamMemberLite {
  email: string;
  role: string | null;
}

interface RunSummary {
  id: string;
  agentSlug: string | null;
  agentName: string | null;
  status: "PENDING" | "RUNNING" | "DONE" | "ERROR" | "ARCHIVED";
  filters: unknown;
  sourceSessionCount: number;
  createdAt: string;
  updatedAt: string;
}

interface RunDetail {
  id: string;
  agentSlug: string | null;
  status: string;
  filters: unknown;
  sourceSessionCount: number;
  createdAt: string;
  updatedAt: string;
  output: string | null;
  agent: { id: string; name: string } | null;
  cards: {
    id: string;
    title: string;
    content: string;
    canvasSection: string | null;
    order: number;
    source: string;
    cardType: string;
    canvasStatus: string;
  }[];
}

interface Props {
  clientId: string;
  clientName: string;
  // Sesiones del Client (las que YA están en sidebarSessions del padre).
  // Las usamos para el preview en vivo del count según filtros.
  clientSessions: SessionLite[];
  // TeamMembers para resolver filtro de roles
  teamMembers: TeamMemberLite[];
  // Run inicialmente seleccionado (viene de la URL ?analysis=runId)
  initialRunId?: string | null;
  // Callback cuando el usuario abre/cierra un run (para sync de URL)
  onRunChange?: (runId: string | null) => void;
}

// ── Constantes ────────────────────────────────────────────────────────────────

const AGENTS = [
  { slug: "sales-analysis", label: "Análisis de ventas", description: "Inteligencia comercial: etapa, perfil, dolores, decisores, presupuesto." },
  { slug: "service-analysis", label: "Análisis de entrega de servicio", description: "Salud de cuenta, adopción, compromisos, bloqueos, expansión, feedback." },
] as const;

const DATE_PRESETS = [
  { id: "7d", label: "Últimos 7 días", days: 7 },
  { id: "30d", label: "Últimos 30 días", days: 30 },
  { id: "90d", label: "Últimos 90 días", days: 90 },
  { id: "180d", label: "Últimos 6 meses", days: 180 },
  { id: "365d", label: "Último año", days: 365 },
  { id: "all", label: "Sin límite", days: null },
] as const;

const INTERNAL_DOMAIN = "smarteamcr.com";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric", month: "short", year: "numeric",
  });
}

/** Cuenta cuántas sesiones matchearían los filtros (preview en vivo, lógica espejo del server) */
function countMatching(
  sessions: SessionLite[],
  teamMembers: TeamMemberLite[],
  filters: { from: string | null; to: string | null; teamRoles: string[]; onlyWithContent: boolean }
): number {
  const fromTime = filters.from ? new Date(filters.from).getTime() : null;
  const toTime = filters.to ? new Date(filters.to).getTime() : null;
  const rolesSet = new Set(filters.teamRoles.map((r) => r.toLowerCase()));
  const teamEmailsByRole = new Set<string>();
  if (rolesSet.size > 0) {
    for (const m of teamMembers) {
      if (m.role && rolesSet.has(m.role.toLowerCase())) {
        teamEmailsByRole.add(m.email.toLowerCase());
      }
    }
  }
  return sessions.filter((s) => {
    const t = new Date(s.date).getTime();
    if (fromTime && t < fromTime) return false;
    if (toTime && t > toTime) return false;
    if (teamEmailsByRole.size > 0) {
      const hasRole = s.participants.some((p) => teamEmailsByRole.has(p.toLowerCase()));
      if (!hasRole) return false;
    }
    if (filters.onlyWithContent) {
      if (!s.hasTranscript && !s.hasSummary) return false;
    }
    return true;
  }).length;
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function AnalysisPanel({
  clientId, clientName, clientSessions, teamMembers, initialRunId, onRunChange,
}: Props) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [openRunId, setOpenRunId] = useState<string | null>(initialRunId ?? null);
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null);
  const [runDetailLoading, setRunDetailLoading] = useState(false);

  // Configurador
  const [showConfig, setShowConfig] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<"sales-analysis" | "service-analysis">("sales-analysis");
  const [datePreset, setDatePreset] = useState<string>("90d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [onlyWithContent, setOnlyWithContent] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);

  // Roles únicos de TeamMember
  const availableRoles = useMemo(() => {
    const set = new Set<string>();
    for (const m of teamMembers) {
      if (m.role) set.add(m.role);
    }
    return [...set].sort();
  }, [teamMembers]);

  // Filtros computados (preset → from/to)
  const computedFilters = useMemo(() => {
    let from: string | null = null;
    let to: string | null = null;
    if (datePreset === "custom") {
      from = customFrom || null;
      to = customTo || null;
    } else {
      const preset = DATE_PRESETS.find((p) => p.id === datePreset);
      if (preset?.days) {
        const d = new Date();
        d.setDate(d.getDate() - preset.days);
        from = d.toISOString();
      }
    }
    return { from, to, teamRoles: selectedRoles, onlyWithContent };
  }, [datePreset, customFrom, customTo, selectedRoles, onlyWithContent]);

  // Preview de count
  const previewCount = useMemo(
    () => countMatching(clientSessions, teamMembers, computedFilters),
    [clientSessions, teamMembers, computedFilters]
  );

  // ── Cargar lista de runs al montar / cambiar clientId ──
  useEffect(() => {
    let cancelled = false;
    setRunsLoading(true);
    fetch(`/api/sessions/analyses?clientId=${encodeURIComponent(clientId)}`)
      .then((r) => r.json())
      .then((data: RunSummary[]) => {
        if (!cancelled) setRuns(Array.isArray(data) ? data : []);
      })
      .catch(() => { if (!cancelled) setRuns([]); })
      .finally(() => { if (!cancelled) setRunsLoading(false); });
    return () => { cancelled = true; };
  }, [clientId]);

  // ── Cargar detalle del run abierto ──
  useEffect(() => {
    if (!openRunId) {
      setRunDetail(null);
      return;
    }
    let cancelled = false;
    setRunDetailLoading(true);
    fetch(`/api/sessions/analyses/${openRunId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data: RunDetail | null) => {
        if (!cancelled) setRunDetail(data);
      })
      .finally(() => { if (!cancelled) setRunDetailLoading(false); });
    return () => { cancelled = true; };
  }, [openRunId]);

  // ── Sync con padre cuando cambia openRunId ──
  useEffect(() => {
    onRunChange?.(openRunId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRunId]);

  // ── Ejecutar análisis ──
  const executeAnalysis = useCallback(async () => {
    setExecError(null);
    setExecuting(true);
    try {
      const res = await fetch("/api/sessions/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          agentSlug: selectedAgent,
          filters: computedFilters,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.status !== "DONE") {
        throw new Error(data.error ?? "Error al ejecutar análisis");
      }
      // Recargar lista de runs y abrir el nuevo
      const updatedRuns = await fetch(`/api/sessions/analyses?clientId=${encodeURIComponent(clientId)}`).then((r) => r.json());
      setRuns(Array.isArray(updatedRuns) ? updatedRuns : []);
      setOpenRunId(data.runId);
      setShowConfig(false);
    } catch (err) {
      setExecError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setExecuting(false);
    }
  }, [clientId, selectedAgent, computedFilters]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-5 py-3 border-b border-gray-800 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">Análisis del cliente</p>
          <p className="text-xs text-gray-500">{clientName}</p>
        </div>
        {!openRunId && !showConfig && (
          <button
            onClick={() => setShowConfig(true)}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-brand/20 text-brand-light border border-brand/30 hover:bg-brand/30 transition-colors"
          >
            + Nuevo análisis
          </button>
        )}
        {openRunId && (
          <button
            onClick={() => setOpenRunId(null)}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            ← Volver a lista
          </button>
        )}
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto">
        {/* Configurador de nuevo análisis */}
        {showConfig && !openRunId && (
          <div className="p-5 space-y-5">
            <h3 className="text-sm font-semibold text-white">Nuevo análisis</h3>

            {execError && (
              <div className="px-3 py-2 rounded bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                {execError}
              </div>
            )}

            {/* Agente */}
            <div>
              <label className="block text-xs text-gray-500 mb-2">Agente</label>
              <div className="space-y-2">
                {AGENTS.map((a) => (
                  <button
                    key={a.slug}
                    onClick={() => setSelectedAgent(a.slug)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedAgent === a.slug
                        ? "border-brand bg-brand/10"
                        : "border-gray-800 hover:border-gray-700 bg-gray-900/40"
                    }`}
                  >
                    <p className="text-sm font-medium text-white">{a.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{a.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Rango de fechas */}
            <div>
              <label className="block text-xs text-gray-500 mb-2">Rango de fechas</label>
              <div className="flex flex-wrap gap-1.5">
                {DATE_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setDatePreset(p.id)}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      datePreset === p.id
                        ? "border-brand text-brand-light bg-brand/10"
                        : "border-gray-800 text-gray-400 hover:border-gray-700 hover:text-gray-300"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  onClick={() => setDatePreset("custom")}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                    datePreset === "custom"
                      ? "border-brand text-brand-light bg-brand/10"
                      : "border-gray-800 text-gray-400 hover:border-gray-700 hover:text-gray-300"
                  }`}
                >
                  Custom
                </button>
              </div>
              {datePreset === "custom" && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="px-2 py-1.5 text-xs bg-gray-900 border border-gray-800 rounded text-gray-200"
                  />
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="px-2 py-1.5 text-xs bg-gray-900 border border-gray-800 rounded text-gray-200"
                  />
                </div>
              )}
            </div>

            {/* Equipo */}
            <div>
              <label className="block text-xs text-gray-500 mb-2">
                Equipo <span className="text-gray-700">(vacío = todos)</span>
              </label>
              {availableRoles.length === 0 ? (
                <p className="text-xs text-gray-600 italic">No hay roles registrados en TeamMember</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {availableRoles.map((role) => {
                    const active = selectedRoles.includes(role);
                    return (
                      <button
                        key={role}
                        onClick={() => {
                          setSelectedRoles((prev) =>
                            active ? prev.filter((r) => r !== role) : [...prev, role]
                          );
                        }}
                        className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                          active
                            ? "border-brand text-brand-light bg-brand/10"
                            : "border-gray-800 text-gray-400 hover:border-gray-700 hover:text-gray-300"
                        }`}
                      >
                        {role}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Solo con contenido */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyWithContent}
                onChange={(e) => setOnlyWithContent(e.target.checked)}
                className="rounded border-gray-700 bg-gray-900 text-brand focus:ring-brand focus:ring-offset-0"
              />
              <span className="text-xs text-gray-400">
                Solo sesiones con transcript o resumen <span className="text-gray-700">(recomendado)</span>
              </span>
            </label>

            {/* Preview */}
            <div className="px-4 py-3 rounded-lg bg-gray-900/60 border border-gray-800">
              <p className="text-xs text-gray-500 mb-0.5">Vas a analizar</p>
              <p className="text-lg font-semibold text-white">
                {previewCount} sesión{previewCount === 1 ? "" : "es"}
              </p>
              {previewCount === 0 && (
                <p className="text-[11px] text-amber-400 mt-1">
                  Ningún match con estos filtros — ajustá rango/equipo
                </p>
              )}
            </div>

            {/* Botones */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-800">
              <button
                onClick={() => { setShowConfig(false); setExecError(null); }}
                disabled={executing}
                className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                onClick={executeAnalysis}
                disabled={executing || previewCount === 0}
                className="px-4 py-1.5 text-xs font-medium rounded-md bg-brand/20 text-brand-light border border-brand/30 hover:bg-brand/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {executing && (
                  <span className="w-3 h-3 border border-brand-light/60 border-t-transparent rounded-full animate-spin" />
                )}
                {executing ? "Ejecutando…" : "Ejecutar análisis"}
              </button>
            </div>
          </div>
        )}

        {/* Lista de runs previos */}
        {!showConfig && !openRunId && (
          <div className="p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
              Análisis previos
            </p>
            {runsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 rounded-lg skeleton-shimmer" />
                ))}
              </div>
            ) : runs.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-gray-500 mb-2">No hay análisis previos para este cliente.</p>
                <p className="text-xs text-gray-600">Click en &quot;+ Nuevo análisis&quot; para empezar.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {runs.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setOpenRunId(r.id)}
                    className="w-full text-left p-3 rounded-lg border border-gray-800 bg-gray-900/40 hover:bg-gray-900/80 hover:border-gray-700 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-sm font-medium text-white truncate">
                        {r.agentName ?? r.agentSlug ?? "Análisis"}
                      </p>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="text-xs text-gray-500">
                      {formatDate(r.createdAt)} · {r.sourceSessionCount} sesión{r.sourceSessionCount === 1 ? "" : "es"}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Detalle del run abierto */}
        {openRunId && (
          <div className="p-5">
            {runDetailLoading || !runDetail ? (
              <div className="space-y-3">
                {[90, 75, 85].map((w, i) => (
                  <div key={i} className="h-4 rounded-full skeleton-shimmer" style={{ width: `${w}%` }} />
                ))}
              </div>
            ) : (
              <div className="space-y-6 max-w-3xl">
                {/* Meta del run */}
                <div className="pb-4 border-b border-gray-800">
                  <h2 className="text-lg font-semibold text-white mb-1">
                    {runDetail.agent?.name ?? runDetail.agentSlug ?? "Análisis"}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {formatDate(runDetail.createdAt)} · {runDetail.sourceSessionCount} sesión{runDetail.sourceSessionCount === 1 ? "" : "es"} analizadas
                  </p>
                  {runDetail.filters !== null && typeof runDetail.filters === "object" && (
                    <FiltersBadge filters={runDetail.filters as Record<string, unknown>} />
                  )}
                </div>

                {runDetail.status === "ERROR" ? (
                  <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">
                    <p className="font-medium mb-1">Error al ejecutar el análisis</p>
                    <p className="text-xs text-red-400 font-mono">{runDetail.output ?? "Sin detalle"}</p>
                  </div>
                ) : runDetail.cards.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">Este run no generó cards.</p>
                ) : (
                  <div className="space-y-6">
                    {runDetail.cards
                      .slice()
                      .sort((a, b) => a.order - b.order)
                      .map((card) => (
                        <article key={card.id} className="rounded-xl border border-gray-800 bg-gray-900/30 p-5">
                          <h3 className="text-base font-semibold text-white mb-3">{card.title}</h3>
                          <div className="prose prose-sm prose-invert max-w-none prose-headings:font-semibold prose-headings:text-gray-200 prose-p:text-gray-300 prose-li:text-gray-300 prose-strong:text-white">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{card.content}</ReactMarkdown>
                          </div>
                        </article>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Subcomponentes auxiliares ────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; bg: string; fg: string; border: string }> = {
    PENDING:  { label: "Pendiente",   bg: "bg-gray-500/10",   fg: "text-gray-400",   border: "border-gray-500/20" },
    RUNNING:  { label: "Ejecutando",  bg: "bg-amber-500/10",  fg: "text-amber-400",  border: "border-amber-500/20" },
    DONE:     { label: "Listo",       bg: "bg-green-500/10",  fg: "text-green-400",  border: "border-green-500/20" },
    ERROR:    { label: "Error",       bg: "bg-red-500/10",    fg: "text-red-400",    border: "border-red-500/20" },
    ARCHIVED: { label: "Archivado",   bg: "bg-gray-500/10",   fg: "text-gray-500",   border: "border-gray-500/20" },
  };
  const c = cfg[status] ?? cfg.PENDING;
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${c.bg} ${c.fg} ${c.border}`}>
      {c.label}
    </span>
  );
}

function FiltersBadge({ filters }: { filters: Record<string, unknown> }) {
  const parts: string[] = [];
  if (filters.from) parts.push(`desde ${formatDateShort(filters.from as string)}`);
  if (filters.to) parts.push(`hasta ${formatDateShort(filters.to as string)}`);
  if (Array.isArray(filters.teamRoles) && filters.teamRoles.length > 0) {
    parts.push(`equipo: ${(filters.teamRoles as string[]).join(", ")}`);
  }
  if (filters.onlyWithContent === false) parts.push("incluye sin contenido");
  if (parts.length === 0) return null;
  return (
    <p className="text-[10px] text-gray-600 mt-1">Filtros: {parts.join(" · ")}</p>
  );
}
