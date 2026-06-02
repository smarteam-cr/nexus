"use client";

/**
 * components/clients/MeetingsTab.tsx
 *
 * Tab "Reuniones" del proyecto. Agrupa todo el ciclo de la reunión a nivel
 * proyecto: minuta última, acciones, cards, historial cronológico, participantes.
 *
 * Sub-tabs:
 *   - lastMinute: minuta de la última sesión primaria + auto-trigger F4-C
 *   - actions: ActionItems del proyecto agrupados por sesión origen
 *   - cards: AgentRuns con cards generadas desde sesiones del proyecto
 *   - history: timeline cronológico de SessionProject
 *   - participants: análisis de participantes (F5-B, placeholder con CTA)
 */
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";

interface ActionItem {
  id: string;
  text: string;
  ownerEmail: string | null;
  dueDate: string | null;
  status: string;
  done: boolean;
  source: string | null;
  sessionId: string | null;
  session: { id: string; title: string; date: string } | null;
}

interface CardRun {
  id: string;
  createdAt: string;
  agentName: string;
  sourceSessionIds: string[];
  cards: {
    id: string;
    title: string;
    content: string;
    cardType: string;
    createdAt: string;
  }[];
}

interface HistoryItem {
  sessionId: string;
  title: string;
  date: string;
  duration: number;
  participants: string[];
  detectedTopics: string[];
  isPrimary: boolean;
  source: string;
  confidence: number | null;
  hasTranscript: boolean;
  minuteStatus: "DRAFT" | "REVIEWED" | "EDITED" | null;
}

interface MeetingsData {
  project: {
    id: string;
    name: string;
    clientId: string;
    clientName: string;
    serviceType: string | null;
  };
  lastMinute: {
    sessionId: string;
    sessionTitle: string;
    sessionDate: string;
    minute: {
      id: string;
      status: "DRAFT" | "REVIEWED" | "EDITED";
      summary: string;
      agreements: unknown;
      decisions: unknown;
      risks: unknown;
      topics: unknown;
      reviewedAt: string | null;
    };
  } | null;
  latestSessionWithoutMinute: {
    id: string;
    title: string;
    date: string;
  } | null;
  actionItems: ActionItem[];
  cardRuns: CardRun[];
  history: HistoryItem[];
  isHot: boolean;
  hotConfig: { threshold: number; windowDays: number };
  participantSnapshot: {
    stats: unknown;
    sessionsAnalyzed: number;
    updatedAt: string;
  } | null;
}

type SubTab = "lastMinute" | "actions" | "cards" | "history" | "participants";

export default function MeetingsTab({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<SubTab>("lastMinute");
  const [data, setData] = useState<MeetingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/projects/${projectId}/meetings`);
    if (res.ok) setData((await res.json()) as MeetingsData);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // F4-C: si entramos a "lastMinute" y no hay minuta pero sí hay sesión con
  // transcript pendiente, disparar generación automática.
  useEffect(() => {
    if (tab !== "lastMinute" || !data) return;
    if (data.lastMinute) return;
    if (!data.latestSessionWithoutMinute) return;
    if (generating) return;
    autoGenerate(data.latestSessionWithoutMinute.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, data, generating]);

  async function autoGenerate(sessionId: string) {
    setGenerating(true);
    try {
      await fetch(`/api/sessions/${sessionId}/post-process`, { method: "POST" });
      // Poll cada 3s hasta 60s
      const startedAt = Date.now();
      while (Date.now() - startedAt < 60000) {
        await new Promise((r) => setTimeout(r, 3000));
        const res = await fetch(`/api/projects/${projectId}/meetings`);
        if (res.ok) {
          const fresh = (await res.json()) as MeetingsData;
          if (fresh.lastMinute) {
            setData(fresh);
            break;
          }
        }
      }
    } finally {
      setGenerating(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="space-y-3 pt-2">
        <div className="h-4 w-32 rounded-full skeleton-shimmer" />
        <div className="h-32 rounded-2xl skeleton-shimmer" />
      </div>
    );
  }
  if (!data) {
    return (
      <p className="text-sm text-gray-500">Error al cargar reuniones.</p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header con badge "Proyecto activo" si hot */}
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
          Reuniones del proyecto
        </h3>
        {data.isHot && (
          <span
            title={`Generación proactiva activa: ${data.hotConfig.threshold}+ análisis en ${data.hotConfig.windowDays} días`}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 text-[10px] font-semibold"
          >
            🔥 Proyecto activo
          </span>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-0 border-b border-gray-800">
        <SubTabButton active={tab === "lastMinute"} onClick={() => setTab("lastMinute")}>
          Última minuta
        </SubTabButton>
        <SubTabButton active={tab === "actions"} onClick={() => setTab("actions")} count={data.actionItems.length}>
          Acciones
        </SubTabButton>
        <SubTabButton active={tab === "cards"} onClick={() => setTab("cards")} count={data.cardRuns.reduce((s, r) => s + r.cards.length, 0)}>
          Cards
        </SubTabButton>
        <SubTabButton active={tab === "history"} onClick={() => setTab("history")} count={data.history.length}>
          Historial
        </SubTabButton>
        <SubTabButton active={tab === "participants"} onClick={() => setTab("participants")}>
          Participantes
        </SubTabButton>
      </div>

      <div className="pt-2">
        {tab === "lastMinute" && (
          <LastMinuteSubtab data={data} generating={generating} onReload={reload} />
        )}
        {tab === "actions" && <ActionsSubtab items={data.actionItems} onReload={reload} />}
        {tab === "cards" && <CardsSubtab runs={data.cardRuns} />}
        {tab === "history" && <HistorySubtab history={data.history} />}
        {tab === "participants" && (
          <ParticipantsSubtab
            projectId={projectId}
            snapshot={data.participantSnapshot}
            onReload={reload}
          />
        )}
      </div>
    </div>
  );
}

// ── SubTabButton ─────────────────────────────────────────────────────────────

function SubTabButton({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
        active
          ? "border-brand text-white"
          : "border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-700"
      }`}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-semibold bg-gray-800 text-gray-300 rounded-full">
          {count}
        </span>
      )}
    </button>
  );
}

// ── LastMinute Sub-tab ───────────────────────────────────────────────────────

function LastMinuteSubtab({
  data,
  generating,
  onReload,
}: {
  data: MeetingsData;
  generating: boolean;
  onReload: () => void;
}) {
  const [stepIdx, setStepIdx] = useState(0);
  useEffect(() => {
    if (!generating) return;
    const steps = ["Analizando transcript...", "Extrayendo acuerdos y decisiones...", "Generando acciones derivadas..."];
    const interval = setInterval(() => {
      setStepIdx((i) => (i + 1) % steps.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [generating]);

  if (generating) {
    const steps = ["Analizando transcript...", "Extrayendo acuerdos y decisiones...", "Generando acciones derivadas..."];
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-8 text-center space-y-4">
        <div className="flex justify-center">
          <div className="w-8 h-8 border-2 border-amber-400/50 border-t-amber-400 rounded-full animate-spin" />
        </div>
        <div>
          <p className="text-sm font-semibold text-amber-300">Generando minuta automáticamente</p>
          <p className="text-xs text-amber-400/80 mt-1">{steps[stepIdx]}</p>
          <p className="text-[10px] text-amber-400/60 mt-2">
            Sesión: {data.latestSessionWithoutMinute?.title}
          </p>
        </div>
      </div>
    );
  }

  if (!data.lastMinute) {
    if (data.latestSessionWithoutMinute) {
      return (
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 space-y-3">
          <p className="text-sm text-gray-300">
            Hay una sesión con transcript pendiente de procesar: <strong>{data.latestSessionWithoutMinute.title}</strong>
          </p>
          <button
            onClick={onReload}
            className="text-xs font-semibold text-brand hover:text-brand/80"
          >
            Refrescar
          </button>
        </div>
      );
    }
    return (
      <div className="rounded-2xl border border-dashed border-gray-700 bg-gray-900/50 p-8 text-center">
        <p className="text-sm text-gray-500">
          Aún no hay reuniones procesadas para este proyecto.
        </p>
        <p className="text-xs text-gray-600 mt-1">
          Cuando llegue un transcript de una sesión asignada al proyecto, la minuta aparecerá acá.
        </p>
      </div>
    );
  }

  const lm = data.lastMinute;
  const m = lm.minute;
  const agreements = (m.agreements as { text: string }[]) ?? [];
  const decisions = (m.decisions as { text: string; rationale?: string }[]) ?? [];
  const risks = (m.risks as { text: string; severity?: string }[]) ?? [];
  const topics = (m.topics as string[]) ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-gray-800">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-500">Última sesión procesada</p>
          <h4 className="text-base font-semibold text-white truncate mt-0.5">{lm.sessionTitle}</h4>
          <p className="text-xs text-gray-500 mt-1">{new Date(lm.sessionDate).toLocaleString("es-CR")}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={m.status} />
          <Link
            href={`/sessions/${lm.sessionId}`}
            className="text-xs text-brand hover:text-brand/80 inline-flex items-center gap-1"
          >
            Ver sesión cruda →
          </Link>
        </div>
      </div>

      <div>
        <SectionLabel>Resumen ejecutivo</SectionLabel>
        <div className="text-sm text-gray-300 leading-relaxed prose prose-sm prose-invert max-w-none">
          <ReactMarkdown>{m.summary}</ReactMarkdown>
        </div>
      </div>

      {agreements.length > 0 && (
        <div>
          <SectionLabel>Acuerdos</SectionLabel>
          <ul className="space-y-1.5">
            {agreements.map((a, i) => (
              <li key={i} className="text-sm text-gray-300 flex gap-2">
                <span className="text-emerald-400">✓</span> {a.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {decisions.length > 0 && (
        <div>
          <SectionLabel>Decisiones</SectionLabel>
          <ul className="space-y-2">
            {decisions.map((d, i) => (
              <li key={i} className="text-sm text-gray-300">
                <p className="font-medium">→ {d.text}</p>
                {d.rationale && <p className="text-xs text-gray-500 mt-0.5 pl-4">{d.rationale}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {risks.length > 0 && (
        <div>
          <SectionLabel>Riesgos</SectionLabel>
          <ul className="space-y-1.5">
            {risks.map((r, i) => {
              const colors =
                r.severity === "high"
                  ? "bg-red-500/10 text-red-300 border-red-500/30"
                  : r.severity === "med"
                  ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                  : "bg-gray-700/40 text-gray-300 border-gray-700";
              return (
                <li
                  key={i}
                  className={`text-sm px-3 py-2 rounded-lg border ${colors}`}
                >
                  ⚠ {r.text}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {topics.length > 0 && (
        <div>
          <SectionLabel>Temas tratados</SectionLabel>
          <ul className="space-y-1">
            {topics.map((t, i) => (
              <li key={i} className="text-xs text-gray-400">• {t}</li>
            ))}
          </ul>
        </div>
      )}

      {m.status === "DRAFT" && (
        <div className="flex items-center gap-2 pt-3 border-t border-gray-800">
          <button
            onClick={async () => {
              await fetch(`/api/sessions/${lm.sessionId}/minute`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "REVIEWED" }),
              });
              onReload();
            }}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
          >
            ✓ Aceptar minuta
          </button>
          <button
            onClick={async () => {
              await fetch(`/api/sessions/${lm.sessionId}/post-process`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ force: true }),
              });
              onReload();
            }}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800"
          >
            ↻ Regenerar
          </button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: "DRAFT" | "REVIEWED" | "EDITED" }) {
  const colors = {
    DRAFT: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    REVIEWED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    EDITED: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  };
  const labels = { DRAFT: "BORRADOR", REVIEWED: "REVISADA", EDITED: "EDITADA" };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${colors[status]}`}>
      {labels[status]}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
      {children}
    </p>
  );
}

// ── Actions Sub-tab ──────────────────────────────────────────────────────────

function ActionsSubtab({ items, onReload }: { items: ActionItem[]; onReload: () => void }) {
  // Agrupar por sesión origen
  const grouped = new Map<string, { label: string; items: ActionItem[] }>();
  for (const it of items) {
    const key = it.sessionId ?? "_manual";
    const existing = grouped.get(key);
    if (existing) {
      existing.items.push(it);
    } else {
      grouped.set(key, {
        label: it.session
          ? `${it.session.title} · ${new Date(it.session.date).toLocaleDateString("es-CR")}`
          : "Sin sesión asociada (manual o legacy)",
        items: [it],
      });
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-700 bg-gray-900/50 p-8 text-center">
        <p className="text-sm text-gray-500">No hay acciones pendientes en este proyecto.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {[...grouped.entries()].map(([key, group]) => (
        <div key={key}>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
            {group.label} <span className="text-gray-600">({group.items.length})</span>
          </p>
          <ul className="space-y-1.5">
            {group.items.map((it) => (
              <li
                key={it.id}
                className="flex items-start gap-2 px-3 py-2 rounded-lg border border-gray-800 hover:bg-gray-900"
              >
                <input
                  type="checkbox"
                  checked={it.done}
                  onChange={async () => {
                    await fetch(`/api/action-items/${it.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ done: !it.done }),
                    });
                    onReload();
                  }}
                  className="mt-1 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200">{it.text}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-500">
                    <span>{it.status}</span>
                    {it.ownerEmail && <span>• @{it.ownerEmail}</span>}
                    {it.dueDate && (
                      <span>• vence {new Date(it.dueDate).toLocaleDateString("es-CR")}</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ── Cards Sub-tab ────────────────────────────────────────────────────────────

function CardsSubtab({ runs }: { runs: CardRun[] }) {
  if (runs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-700 bg-gray-900/50 p-8 text-center">
        <p className="text-sm text-gray-500">No hay cards generadas por agentes desde sesiones de este proyecto.</p>
        <p className="text-xs text-gray-600 mt-1">
          Cuando el proyecto sea "activo" (3+ análisis en 30 días), las cards se generan automáticamente al procesar cada sesión.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {runs.map((run) => (
        <div key={run.id} className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-gray-300">{run.agentName}</p>
            <span className="text-[10px] text-gray-500">
              {new Date(run.createdAt).toLocaleString("es-CR")}
            </span>
          </div>
          <div className="space-y-2">
            {run.cards.map((c) => (
              <div key={c.id} className="rounded-xl border border-gray-800 bg-gray-900 p-3">
                <p className="text-sm font-semibold text-white mb-1">{c.title}</p>
                <div className="text-xs text-gray-300 leading-relaxed prose prose-xs prose-invert max-w-none">
                  <ReactMarkdown>{c.content}</ReactMarkdown>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── History Sub-tab ──────────────────────────────────────────────────────────

function HistorySubtab({ history }: { history: HistoryItem[] }) {
  if (history.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-700 bg-gray-900/50 p-8 text-center">
        <p className="text-sm text-gray-500">No hay sesiones asignadas a este proyecto todavía.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {history.map((h) => (
        <Link
          key={h.sessionId}
          href={`/sessions/${h.sessionId}`}
          className="block px-3 py-3 rounded-xl border border-gray-800 hover:bg-gray-900 transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-white truncate">{h.title}</p>
                {h.isPrimary && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-brand/20 text-brand">PRIMARIO</span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-500">
                <span>{new Date(h.date).toLocaleString("es-CR")}</span>
                <span>•</span>
                <span>{h.participants.length} participantes</span>
                {h.detectedTopics.length > 0 && (
                  <>
                    <span>•</span>
                    <span className="text-gray-400">{h.detectedTopics.slice(0, 3).join(", ")}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {h.minuteStatus === "DRAFT" && <span className="text-[10px] text-amber-400">📝 Borrador</span>}
              {(h.minuteStatus === "REVIEWED" || h.minuteStatus === "EDITED") && (
                <span className="text-[10px] text-emerald-400">✓ Minuta</span>
              )}
              {!h.minuteStatus && h.hasTranscript && (
                <span className="text-[10px] text-gray-500">Sin minuta</span>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

// ── Participants Sub-tab (F5) ────────────────────────────────────────────────

function ParticipantsSubtab({
  projectId,
  snapshot,
  onReload,
}: {
  projectId: string;
  snapshot: MeetingsData["participantSnapshot"];
  onReload: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [feedback, setFeedback] = useState<
    | { type: "skipped" | "error"; message: string }
    | null
  >(null);

  async function runAnalysis() {
    setRunning(true);
    setFeedback(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/analyze-participants`,
        { method: "POST" },
      );
      const body = (await res.json().catch(() => ({}))) as {
        status?: "ok" | "skipped" | "error";
        reason?: string;
        sessionsAnalyzed?: number;
        autoClassified?: number;
      };

      if (!res.ok || body.status === "error") {
        setFeedback({
          type: "error",
          message: body.reason ?? `HTTP ${res.status}`,
        });
      } else if (body.status === "skipped") {
        // El backend no pudo analizar — tradúcimos `reason` técnico a algo accionable.
        const reason = body.reason ?? "Sin información";
        let friendly = reason;
        if (reason.includes("no orphan sessions")) {
          friendly =
            "Este cliente no tiene ninguna sesión vinculada. Antes de analizar participantes, vinculá al menos una sesión desde /sessions/[id] (tab Meta).";
        } else if (reason.includes("went to another project")) {
          friendly = `Se auto-clasificaron ${body.autoClassified ?? "varias"} sesiones del cliente, pero la IA las asignó a otro proyecto del mismo cliente. Revisalas en el sub-tab Historial o asigná manualmente desde /sessions/[id].`;
        } else if (reason.includes("no sessions assigned")) {
          friendly =
            "El proyecto no tiene reuniones asignadas todavía. Asigná al menos una sesión desde /sessions/[id] (tab Meta).";
        }
        setFeedback({ type: "skipped", message: friendly });
      } else {
        // status: "ok" → recargar datos para mostrar el snapshot recién creado
        onReload();
      }
    } catch (e) {
      setFeedback({
        type: "error",
        message: `Error de red: ${(e as Error).message}`,
      });
    } finally {
      setRunning(false);
    }
  }

  if (!snapshot) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-dashed border-gray-700 bg-gray-900/50 p-8 text-center space-y-3">
          <p className="text-sm text-gray-500">
            Aún no se ha analizado el patrón de participación de este proyecto.
          </p>
          <button
            onClick={runAnalysis}
            disabled={running}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-brand text-white hover:bg-brand/90 disabled:opacity-50"
          >
            {running ? "Analizando..." : "Generar análisis ahora"}
          </button>
        </div>
        {feedback && (
          <div
            className={`rounded-xl border p-3 text-sm ${
              feedback.type === "error"
                ? "bg-red-500/10 border-red-500/30 text-red-200"
                : "bg-amber-500/10 border-amber-500/30 text-amber-200"
            }`}
          >
            <p className="font-semibold mb-1">
              {feedback.type === "error" ? "No se pudo analizar" : "Análisis no aplicable"}
            </p>
            <p className="text-xs leading-relaxed opacity-90">{feedback.message}</p>
          </div>
        )}
      </div>
    );
  }

  const stats = snapshot.stats as Record<string, unknown>;
  const lastSeenByRole = (stats.lastSeenByRole as Record<string, string>) ?? {};
  const alerts = (stats.alerts as { text: string; severity?: string }[]) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          Último análisis: {new Date(snapshot.updatedAt).toLocaleString("es-CR")} ·{" "}
          {snapshot.sessionsAnalyzed} sesiones procesadas
        </p>
        <button
          onClick={runAnalysis}
          disabled={running}
          className="text-xs font-semibold text-brand hover:text-brand/80 disabled:opacity-50"
        >
          {running ? "Analizando..." : "↻ Recalcular"}
        </button>
      </div>

      {alerts.length > 0 && (
        <div>
          <SectionLabel>Alertas activas</SectionLabel>
          <div className="space-y-2">
            {alerts.map((a, i) => (
              <div
                key={i}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  a.severity === "high"
                    ? "bg-red-500/10 border-red-500/30 text-red-200"
                    : "bg-amber-500/10 border-amber-500/30 text-amber-200"
                }`}
              >
                ⚠ {a.text}
              </div>
            ))}
          </div>
        </div>
      )}

      {Object.keys(lastSeenByRole).length > 0 && (
        <div>
          <SectionLabel>Última participación por rol del cliente</SectionLabel>
          <ul className="space-y-1.5">
            {Object.entries(lastSeenByRole).map(([role, when]) => (
              <li key={role} className="text-sm text-gray-300 flex items-center justify-between px-3 py-2 rounded border border-gray-800">
                <span className="font-medium">{role}</span>
                <span className="text-xs text-gray-500">{when}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
