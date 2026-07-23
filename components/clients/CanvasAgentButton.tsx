"use client";

/**
 * components/clients/CanvasAgentButton.tsx
 *
 * CTA reutilizable para EJECUTAR un agente anclado a un canvas (reemplaza el pop-up
 * de agentes). Encapsula POST /api/clients/[id]/analyze {agentId, projectId, async?} +
 * polling (pollAgentRun) si el run es detached + spinner + toast (incluye guards como
 * NO_HANDOFF vía data.message). `onDone` deja al canvas refrescar su contenido.
 */
import { useState } from "react";
import { summarizeRun, summarizePollResult } from "@/lib/clients/poll-agent-run";
import { useAgentRun } from "@/hooks/useAgentRun";
import { useToast } from "@/components/ui/Toast";
import { notifyAgentDone, maybeRequestPermission } from "@/lib/notifications/client";
import { useMe } from "@/hooks/useMe";

// Gating COSMÉTICO por sección de permisos (PERM-F5): agentes que ESCRIBEN un
// artefacto → si el usuario no puede NI generar NI regenerar esa sección, el CTA
// no se muestra (la decisión fina generate-vs-regenerate la toma el server, que
// es quien manda). Agentes fuera del mapa no se gatean acá.
const AGENT_SECTION: Record<string, string> = {
  "agent-mapeo-inicial": "procesos",
  "agent-kickoff-canvas": "kickoff",
  "agent-desarrollo-canvas": "desarrollo",
  "agent-exploracion-canvas": "exploracion",
  "agent-timeline-detail": "cronograma",
  "agent-planificacion-canvas": "cronograma",
};

export default function CanvasAgentButton({
  clientId,
  projectId,
  agentId,
  label,
  runningLabel = "Generando…",
  async: useAsync = false,
  onDone,
  className,
  notifyLabel,
  clientName,
  disabled,
  busy,
  alreadyGenerated,
}: {
  clientId: string;
  projectId: string;
  agentId: string;
  label: string;
  runningLabel?: string;
  /** true para agentes pesados (CARDS_AND_FLOWCHARTS) — corren detached y polleamos. */
  async?: boolean;
  onDone?: () => void;
  className?: string;
  /** Sustantivo para la notificación ("diagnóstico"). Default: se deriva del `label`. */
  notifyLabel?: string;
  clientName?: string | null;
  /** Deshabilitar desde afuera SIN señal de progreso (ej: precondición no cumplida). */
  disabled?: boolean;
  /** Como `disabled`, pero indica que YA hay una generación en curso para este canvas
   *  (ej: auto-gen fire-and-forget post-handoff). Muestra spinner + runningLabel para que
   *  el click no quede "muerto y en silencio" — es honesto sobre por qué no responde. */
  busy?: boolean;
  /** (C) ¿El artefacto YA tiene contenido generado por IA? Define qué celda de permiso
   *  exigirá el server (resolveArtifactGate): existe → `regenerate`; no existe → `generate`.
   *  Si se pasa, el CTA se gatea por ESA celda (honesto: no muestra un botón que dará 403).
   *  `undefined` (no threadeado por el montaje) → fallback al OR generate||regenerate (compat). */
  alreadyGenerated?: boolean;
}) {
  const [running, setRunning] = useState(false);
  const toast = useToast();
  const me = useMe();
  const { phase, track } = useAgentRun(clientId);

  // Mientras carga /api/me se muestra (sin flash para el caso común permitido); con el mapa
  // cargado, se oculta si falta el permiso REQUERIDO. (C) Si el montaje pasó `alreadyGenerated`,
  // se exige la MISMA celda que el server resolverá (generate si no existe, regenerate si existe)
  // → el CTA no aparece si va a dar 403. Sin ese dato → OR generate||regenerate (compat).
  const section = AGENT_SECTION[agentId];
  const sectionPerms = section ? me?.permissions?.sections?.[section] : undefined;
  const requiredPermOk =
    alreadyGenerated === undefined
      ? sectionPerms?.generate === true || sectionPerms?.regenerate === true
      : alreadyGenerated
        ? sectionPerms?.regenerate === true
        : sectionPerms?.generate === true;
  const hiddenByPermissions = !!section && !!me && !requiredPermOk;

  // Notificación "agente terminado": etiqueta = notifyLabel o el label sin el verbo.
  const noun =
    notifyLabel ??
    (label.replace(/^(generar|regenerar|crear)\s+(el\s+|la\s+|los\s+|las\s+)?/i, "").trim() || "documento");
  const notifyUrl = `/clients/${clientId}`;

  const run = async () => {
    if (running || disabled || busy) return;
    maybeRequestPermission(); // gesto del usuario → ofrecer activar notificaciones (una vez)
    setRunning(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, projectId, ...(useAsync ? { async: true } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Guards (p.ej. NO_HANDOFF) devuelven { error, message } → mostrar el mensaje claro.
        toast.error(data.message ?? data.error ?? "No se pudo ejecutar el agente.");
      } else if (data.runId) {
        const result = await track(data.runId);
        const summary = summarizePollResult(result);
        if (summary.type === "success") {
          toast.success(summary.message);
          onDone?.();
        } else {
          toast.error(summary.message);
        }
        void notifyAgentDone({ label: noun, clientName, ok: summary.type === "success", url: notifyUrl });
      } else {
        toast.success(`Listo — ${summarizeRun(data)}`);
        onDone?.();
        void notifyAgentDone({ label: noun, clientName, ok: true, url: notifyUrl });
      }
    } catch {
      toast.error("Error de conexión.");
    }
    setRunning(false);
  };

  if (hiddenByPermissions) return null;

  // `busy` (generación externa en curso) se muestra como el estado de correr: spinner +
  // runningLabel. Así el botón no queda como un CTA muerto que ignora el click en silencio.
  const showRunning = running || !!busy;

  return (
    <button
      onClick={run}
      disabled={running || disabled || !!busy}
      className={
        className ??
        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-primary-fg bg-brand hover:bg-brand-dark disabled:opacity-60 transition-colors"
      }
    >
      {showRunning ? (
        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      )}
      {showRunning ? (phase ?? runningLabel) : label}
    </button>
  );
}
