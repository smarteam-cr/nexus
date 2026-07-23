"use client";

/**
 * components/clients/ProjectExploracionSection.tsx
 *
 * Sección dedicada de la EXPLORACIÓN del negocio dentro del proyecto — el disparador
 * on-demand del canvas "Exploración". Espeja la forma de `ProjectHandoffSection`
 * (badge de estado + subtítulo con la señal relevante + CTA + "Ver documento"), pero
 * mucho más chica: acá no hay sync a HubSpot, ni contexto de sesiones, ni exclusiones.
 *
 * Por qué on-demand y no siempre visible como canvas: la exploración se hace DESPUÉS
 * del kickoff, y pre-crear el canvas en los ~113 proyectos repetiría el problema de los
 * 111 cascarones vacíos de Handoff que hubo que borrar. Hasta que el CSE la genera, el
 * canvas no existe y no aparece en el dropdown.
 *
 * NO tiene compartir ni publicar: el documento es interno y no existe superficie externa
 * (congelado por `lib/canvas/exploracion-internal.test.ts`).
 */
import { useCallback, useEffect, useState } from "react";
import CanvasAgentButton from "./CanvasAgentButton";

interface ExploracionStatus {
  canvasId: string | null;
  generated: boolean;
  hasHandoff: boolean;
  lastRun: { at: string; status: string } | null;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric" });
}

export default function ProjectExploracionSection({
  projectId,
  clientId,
  onOpenCanvas,
}: {
  projectId: string;
  clientId: string;
  /** Abre el canvas de Exploración en el panel (refresca la lista y cambia de tab). */
  onOpenCanvas?: (canvasId: string) => void;
}) {
  const [status, setStatus] = useState<ExploracionStatus | null>(null);

  const fetchStatus = useCallback(() => {
    return fetch(`/api/projects/${projectId}/exploracion`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ExploracionStatus | null) => { if (d) setStatus(d); })
      .catch(() => {});
  }, [projectId]);

  useEffect(() => { void fetchStatus(); }, [fetchStatus]);

  // Tras generar: refrescar el estado y abrir el documento — el canvas acaba de nacer,
  // así que el panel tiene que re-listar sus canvases para que aparezca en el dropdown.
  const onDone = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/exploracion`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (res) {
      setStatus(res);
      if (res.canvasId) onOpenCanvas?.(res.canvasId);
    }
  }, [projectId, onOpenCanvas]);

  // Hasta el primer fetch no pintamos nada: sin saber si existe, cualquier badge mentiría.
  if (!status) return null;

  const { generated, hasHandoff, canvasId, lastRun } = status;

  const badge = generated ? (
    <span className="text-[10px] font-bold uppercase tracking-wider text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
      Generada
    </span>
  ) : (
    <span className="text-[10px] font-bold uppercase tracking-wider text-fg-muted bg-surface-muted border border-line rounded-full px-2 py-0.5">
      No generada
    </span>
  );

  return (
    <section className="rounded-2xl border border-line bg-surface">
      <div className="flex items-center gap-3 px-5 py-3.5">
        <svg className="w-4 h-4 text-brand flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-fg">Exploración del negocio</h3>
            {badge}
            <span className="text-[10px] font-medium text-fg-muted">Documento interno</span>
          </div>
          <p className="text-xs text-fg-muted mt-0.5 truncate">
            {generated
              ? `Qué falta entender de este cliente y cómo preguntarlo${lastRun ? ` · ${fmtDate(lastRun.at)}` : ""}`
              : "Guía de qué entender del negocio, cómo preguntarlo, en qué orden y con quién"}
          </p>
          {!hasHandoff && !generated && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 mt-1.5 inline-block">
              Este proyecto todavía no tiene handoff generado — es la fuente ancla, y sin él la
              exploración va a marcar casi todo como &laquo;por verificar&raquo;.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {generated && canvasId && onOpenCanvas && (
            <button
              onClick={() => onOpenCanvas(canvasId)}
              className="text-xs font-medium text-fg-muted hover:text-fg px-2 py-1.5 rounded-lg hover:bg-surface-hover transition-colors"
            >
              Ver documento
            </button>
          )}
          <CanvasAgentButton
            clientId={clientId}
            projectId={projectId}
            agentId="agent-exploracion-canvas"
            label={generated ? "Regenerar" : "Generar exploración"}
            runningLabel="Explorando el negocio…"
            notifyLabel="exploración del negocio"
            async
            onDone={onDone}
            alreadyGenerated={generated}
          />
        </div>
      </div>
    </section>
  );
}
