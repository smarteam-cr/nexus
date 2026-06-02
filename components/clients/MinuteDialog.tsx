"use client";

/**
 * components/clients/MinuteDialog.tsx
 *
 * Dialog modal centrado para la minuta de la última sesión primaria del
 * proyecto. Reemplaza al ex-MeetingsTab. Dos pestañas:
 *   - Minuta: summary + acuerdos + decisiones + riesgos + topics
 *   - Participantes: stats + alertas accionables
 *
 * CTA "Ver historial de sesiones →" abre un drawer derecho con SessionHistoryDrawer.
 *
 * Si la última sesión tiene transcript pero aún no tiene minuta, se dispara
 * el auto-trigger del post-process y se muestra un loader animado.
 */
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import SessionHistoryDrawer from "./SessionHistoryDrawer";

// ── Tipos ──────────────────────────────────────────────────────────────────

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
  history: HistoryItem[];
  isHot: boolean;
  hotConfig: { threshold: number; windowDays: number };
  participantSnapshot: {
    stats: unknown;
    sessionsAnalyzed: number;
    updatedAt: string;
  } | null;
}

type SubTab = "minute" | "participants";

// ── Dialog principal ───────────────────────────────────────────────────────

export default function MinuteDialog({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<SubTab>("minute");
  const [data, setData] = useState<MeetingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/projects/${projectId}/meetings`);
    if (res.ok) setData((await res.json()) as MeetingsData);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Cerrar con ESC
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (historyOpen) setHistoryOpen(false);
        else onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [historyOpen, onClose]);

  // Auto-trigger del post-process si no hay minuta pero sí hay transcript
  useEffect(() => {
    if (tab !== "minute" || !data) return;
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

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40 animate-in fade-in duration-150"
        onClick={onClose}
      />

      {/* Modal centrado */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col pointer-events-auto animate-in fade-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header con tabs + cerrar */}
          <div className="flex-shrink-0 border-b border-gray-800">
            <div className="flex items-center justify-between px-5 pt-4 pb-0">
              <div className="flex items-center gap-1">
                <TabButton active={tab === "minute"} onClick={() => setTab("minute")}>
                  Minuta
                </TabButton>
                <TabButton active={tab === "participants"} onClick={() => setTab("participants")}>
                  Participantes
                </TabButton>
              </div>
              <div className="flex items-center gap-2">
                {data && data.history.length > 0 && (
                  <button
                    onClick={() => setHistoryOpen(true)}
                    className="text-xs text-brand hover:text-brand/80 font-medium px-2 py-1 rounded"
                  >
                    Ver historial de sesiones →
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
                  aria-label="Cerrar"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Contenido scrollable */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {loading && !data ? (
              <div className="space-y-3 pt-2">
                <div className="h-4 w-32 rounded-full skeleton-shimmer" />
                <div className="h-32 rounded-2xl skeleton-shimmer" />
              </div>
            ) : !data ? (
              <p className="text-sm text-gray-500">Error al cargar datos del proyecto.</p>
            ) : tab === "minute" ? (
              <MinuteContent data={data} generating={generating} onReload={reload} />
            ) : (
              <ParticipantsContent
                projectId={projectId}
                snapshot={data.participantSnapshot}
                onReload={reload}
              />
            )}
          </div>
        </div>
      </div>

      {/* Drawer derecho de Historial — se abre desde el botón */}
      {historyOpen && data && (
        <SessionHistoryDrawer
          clientId={data.project.clientId}
          history={data.history}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </>
  );
}

// ── TabButton ──────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        active
          ? "border-brand text-white"
          : "border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

// ── Minute content ─────────────────────────────────────────────────────────

function MinuteContent({
  data,
  generating,
  onReload,
}: {
  data: MeetingsData;
  generating: boolean;
  onReload: () => void;
}) {
  const [stepIdx, setStepIdx] = useState(0);
  const steps = [
    "Analizando transcript...",
    "Extrayendo acuerdos y decisiones...",
    "Generando acciones derivadas...",
  ];
  useEffect(() => {
    if (!generating) return;
    const id = setInterval(() => setStepIdx((i) => (i + 1) % steps.length), 4000);
    return () => clearInterval(id);
  }, [generating, steps.length]);

  if (generating) {
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
            Hay una sesión con transcript pendiente de procesar:{" "}
            <strong>{data.latestSessionWithoutMinute.title}</strong>
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
          <p className="text-xs text-gray-500 mt-1">
            {new Date(lm.sessionDate).toLocaleString("es-CR")}
          </p>
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
                <li key={i} className={`text-sm px-3 py-2 rounded-lg border ${colors}`}>
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
              <li key={i} className="text-xs text-gray-400">
                • {t}
              </li>
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
    <span
      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${colors[status]}`}
    >
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

// ── Participants content ───────────────────────────────────────────────────

function ParticipantsContent({
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
    { type: "skipped" | "error"; message: string } | null
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
        setFeedback({ type: "error", message: body.reason ?? `HTTP ${res.status}` });
      } else if (body.status === "skipped") {
        const reason = body.reason ?? "Sin información";
        let friendly = reason;
        if (reason.includes("no orphan sessions")) {
          friendly =
            "Este cliente no tiene ninguna sesión vinculada. Antes de analizar participantes, vinculá al menos una sesión desde /sessions/[id] (tab Meta).";
        } else if (reason.includes("went to another project")) {
          friendly = `Se auto-clasificaron ${body.autoClassified ?? "varias"} sesiones del cliente, pero la IA las asignó a otro proyecto del mismo cliente.`;
        } else if (reason.includes("no sessions assigned")) {
          friendly =
            "El proyecto no tiene reuniones asignadas todavía. Asigná al menos una sesión desde /sessions/[id] (tab Meta).";
        }
        setFeedback({ type: "skipped", message: friendly });
      } else {
        onReload();
      }
    } catch (e) {
      setFeedback({ type: "error", message: `Error de red: ${(e as Error).message}` });
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
              <li
                key={role}
                className="text-sm text-gray-300 flex items-center justify-between px-3 py-2 rounded border border-gray-800"
              >
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
