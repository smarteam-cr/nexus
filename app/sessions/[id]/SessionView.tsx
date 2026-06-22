"use client";

/**
 * app/sessions/[id]/SessionView.tsx
 *
 * Vista cruda de una sesión (post F3-C). El análisis (minuta, acciones, cards,
 * participantes) ya NO vive acá — se movió al tab "Reuniones" del proyecto
 * asignado. Esta vista sirve para:
 *
 *   - Ver el transcript completo
 *   - Ver participantes / fecha / duración / Doc link
 *   - Confirmar/cambiar a qué proyecto(s) pertenece la sesión (selector N:N)
 *
 * Si la sesión tiene un proyecto primario, un banner arriba linkea al tab
 * Reuniones del proyecto para acceso rápido.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ─── Tipos compartidos con page.tsx ──────────────────────────────────────────

export interface SessionViewData {
  session: {
    id: string;
    title: string;
    date: string;
    duration: number;
    participants: string[];
    transcript: string | null;
    googleDocId: string | null;
    organizerEmail: string | null;
    source: string;
    summary: { overview?: string } | null;
  };
  client: { id: string; name: string; company: string | null } | null;
  minute: {
    id: string;
    summary: string;
    agreements: { text: string }[];
    decisions: { text: string; rationale?: string }[];
    risks: { text: string; severity?: "low" | "med" | "high" }[];
    topics: string[];
    status: "DRAFT" | "REVIEWED" | "EDITED";
    reviewedAt: string | null;
    reviewedByEmail: string | null;
    updatedAt: string;
  } | null;
  actionItems: {
    id: string;
    text: string;
    ownerEmail: string | null;
    dueDate: string | null;
    status: "PENDING" | "IN_PROGRESS" | "BLOCKED" | "DONE";
    done: boolean;
    source: string | null;
    createdAt: string;
  }[];
  cardsBySource: {
    runId: string;
    agentName: string;
    ranAt: string;
    cards: { id: string; title: string; content: string; canvasSection: string | null }[];
  }[];
  teamMembers: { email: string; name: string; role: string | null }[];
  projectAssignments: {
    projectId: string;
    projectName: string;
    serviceType: string | null;
    isPrimary: boolean;
    source: string;
    confidence: number | null;
    rationale: string | null;
  }[];
  availableProjects: {
    id: string;
    name: string;
    serviceType: string | null;
  }[];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(mins: number) {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

type TabKey = "transcript" | "meta";

export default function SessionView({ data }: { data: SessionViewData }) {
  const [tab, setTab] = useState<TabKey>("transcript");
  const router = useRouter();
  const { session, client, projectAssignments, availableProjects, minute, actionItems } = data;

  const primary = projectAssignments.find((a) => a.isPrimary);
  const secondaries = projectAssignments.filter((a) => !a.isPrimary);

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
      {/* ── Header básico ─────────────────────────────────────────────────── */}
      <div>
        <button
          onClick={() => router.back()}
          className="text-xs text-gray-500 hover:text-gray-300 mb-2"
        >
          ← Volver
        </button>
        <h1 className="text-2xl font-bold text-white">{session.title}</h1>
        <div className="flex items-center gap-3 mt-2 text-sm text-gray-400">
          <span>{formatDate(session.date)}</span>
          {session.duration > 0 && (
            <>
              <span className="text-gray-700">·</span>
              <span>{formatDuration(session.duration)}</span>
            </>
          )}
          {client && (
            <>
              <span className="text-gray-700">·</span>
              <Link
                href={`/clients/${client.id}`}
                className="text-brand hover:text-brand/80"
              >
                {client.name}
              </Link>
            </>
          )}
          {session.googleDocId && (
            <>
              <span className="text-gray-700">·</span>
              <a
                href={`https://docs.google.com/document/d/${session.googleDocId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand hover:text-brand/80"
              >
                Abrir Doc ↗
              </a>
            </>
          )}
        </div>
      </div>

      {/* ── Banner: análisis vive en proyecto X ───────────────────────────── */}
      {primary && client && (
        <div className="rounded-2xl border border-brand/30 bg-brand/5 p-4">
          <div className="flex items-start gap-3">
            <div className="text-2xl">📂</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-300">
                Esta sesión es parte del proyecto{" "}
                <Link
                  href={`/clients/${client.id}?tab=${primary.projectId}`}
                  className="font-semibold text-brand hover:text-brand/80"
                >
                  {primary.projectName}
                </Link>
                . El análisis completo (minuta, acciones, cards) vive ahí.
              </p>
              {secondaries.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  También vinculada a:{" "}
                  {secondaries.map((s, i) => (
                    <span key={s.projectId}>
                      <Link
                        href={`/clients/${client.id}?tab=${s.projectId}`}
                        className="text-gray-400 hover:text-gray-200 italic"
                      >
                        {s.projectName}
                      </Link>
                      {i < secondaries.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </p>
              )}
            </div>
            <Link
              href={`/clients/${client.id}?tab=${primary.projectId}`}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand text-white hover:bg-brand/90 flex-shrink-0"
            >
              Ver análisis →
            </Link>
          </div>
        </div>
      )}

      {/* ── Banner amarillo: sin proyecto asignado ────────────────────────── */}
      {!primary && client && availableProjects.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-sm text-amber-300 font-semibold">
            ⚠ Sin proyecto asignado
          </p>
          <p className="text-xs text-amber-400/80 mt-1">
            Asigná esta sesión a un proyecto desde el tab "Meta" para que el análisis se genere ahí.
          </p>
        </div>
      )}

      {!client && (
        <div className="rounded-2xl border border-gray-700 bg-gray-900 p-4">
          <p className="text-sm text-gray-400">
            Esta sesión no fue matched a ningún cliente. No se puede asignar a proyectos.
          </p>
        </div>
      )}

      {/* ── Tabs (sólo 2 ahora) ───────────────────────────────────────────── */}
      <div className="flex gap-0 border-b border-gray-800">
        <TabButton active={tab === "transcript"} onClick={() => setTab("transcript")}>
          Transcript
        </TabButton>
        <TabButton active={tab === "meta"} onClick={() => setTab("meta")}>
          Meta
        </TabButton>
        {/* Resumen rápido de cuántas cosas viven en el proyecto, sin tabs */}
        <div className="ml-auto flex items-center gap-4 px-2 text-xs text-gray-500">
          {minute && <span>📝 minuta {minute.status.toLowerCase()}</span>}
          {actionItems.length > 0 && <span>✓ {actionItems.length} acciones</span>}
        </div>
      </div>

      {/* ── Tab Transcript ────────────────────────────────────────────────── */}
      {tab === "transcript" && (
        <div>
          {!session.transcript ? (
            <div className="rounded-2xl border border-dashed border-gray-700 bg-gray-900/50 p-8 text-center">
              <p className="text-sm text-gray-500">
                Esta sesión no tiene transcript todavía.
              </p>
              {session.googleDocId && (
                <p className="text-xs text-gray-600 mt-1">
                  Google puede tardar unos minutos en generar las notas. Probá re-sincronizar más tarde.
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5 max-h-[70vh] overflow-y-auto">
              <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
                {session.transcript}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* ── Tab Meta ──────────────────────────────────────────────────────── */}
      {tab === "meta" && (
        <MetaTab data={data} />
      )}
    </div>
  );
}

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

// ── Meta Tab: participantes + selector de proyectos ─────────────────────────

function MetaTab({ data }: { data: SessionViewData }) {
  const router = useRouter();
  const { session, projectAssignments, availableProjects } = data;
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null);

  const assignedIds = new Set(projectAssignments.map((a) => a.projectId));
  const unassigned = availableProjects.filter((p) => !assignedIds.has(p.id));

  async function assign(projectId: string, makePrimary: boolean) {
    setBusyProjectId(projectId);
    try {
      await fetch(`/api/sessions/${session.id}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, makePrimary }),
      });
      router.refresh();
    } finally {
      setBusyProjectId(null);
    }
  }

  async function unassign(projectId: string) {
    setBusyProjectId(projectId);
    try {
      await fetch(`/api/sessions/${session.id}/projects/${projectId}`, {
        method: "DELETE",
      });
      router.refresh();
    } finally {
      setBusyProjectId(null);
    }
  }

  async function makePrimary(projectId: string) {
    setBusyProjectId(projectId);
    try {
      await fetch(`/api/sessions/${session.id}/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ makePrimary: true }),
      });
      router.refresh();
    } finally {
      setBusyProjectId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Participantes */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Participantes ({session.participants.length})
        </p>
        <div className="flex flex-wrap gap-1.5">
          {session.participants.map((p) => (
            <span
              key={p}
              className="text-xs px-2 py-1 rounded-md bg-gray-800 text-gray-300"
            >
              {p}
            </span>
          ))}
        </div>
      </div>

      {/* Asignación a proyectos */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Proyectos asignados ({projectAssignments.length})
        </p>
        {projectAssignments.length === 0 ? (
          <p className="text-sm text-gray-500 italic mb-3">
            Sin proyectos asignados.
          </p>
        ) : (
          <ul className="space-y-2 mb-4">
            {projectAssignments.map((a) => (
              <li
                key={a.projectId}
                className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-gray-800 bg-gray-900"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white">{a.projectName}</p>
                    {a.isPrimary && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-brand/20 text-brand">
                        PRIMARIO
                      </span>
                    )}
                    <span className="text-[10px] text-gray-500">
                      ({a.source === "agent" ? "IA" : a.source === "manual" ? "Manual" : "Legacy"}
                      {a.confidence ? ` · ${Math.round(a.confidence * 100)}%` : ""})
                    </span>
                  </div>
                  {a.rationale && (
                    <p className="text-[11px] text-gray-500 italic mt-0.5">{a.rationale}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {!a.isPrimary && (
                    <button
                      onClick={() => makePrimary(a.projectId)}
                      disabled={busyProjectId === a.projectId}
                      className="text-[11px] font-medium text-brand hover:text-brand/80 px-2 py-1 rounded disabled:opacity-50"
                    >
                      Hacer primario
                    </button>
                  )}
                  <button
                    onClick={() => unassign(a.projectId)}
                    disabled={busyProjectId === a.projectId}
                    className="text-[11px] text-red-400 hover:text-red-300 px-2 py-1 rounded disabled:opacity-50"
                  >
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {unassigned.length > 0 && (
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">
              Asignar a otro proyecto del cliente
            </p>
            <div className="flex flex-wrap gap-1.5">
              {unassigned.map((p) => (
                <button
                  key={p.id}
                  onClick={() => assign(p.id, projectAssignments.length === 0)}
                  disabled={busyProjectId === p.id}
                  className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-50"
                >
                  + {p.name}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-600 mt-1">
              El primer proyecto asignado se vuelve primario. Después podés cambiar el primario manualmente.
            </p>
          </div>
        )}
      </div>

      {/* Info técnica */}
      <div className="pt-4 border-t border-gray-800">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Info técnica
        </p>
        <dl className="grid grid-cols-2 gap-y-1 text-xs">
          <dt className="text-gray-500">Source</dt>
          <dd className="text-gray-300">{session.source}</dd>
          <dt className="text-gray-500">Session ID</dt>
          <dd className="text-gray-300 font-mono">{session.id.slice(0, 16)}...</dd>
          {session.organizerEmail && (
            <>
              <dt className="text-gray-500">Organizer</dt>
              <dd className="text-gray-300">{session.organizerEmail}</dd>
            </>
          )}
        </dl>
      </div>
    </div>
  );
}
