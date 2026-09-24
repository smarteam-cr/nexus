"use client";

/**
 * components/clients/ProjectContextSection.tsx
 *
 * Sección "Contexto" del proyecto (reemplaza el bloque suelto "Detectado en HubSpot" +
 * selección de sesiones + fuentes manuales). Colapsable (toggle) y en 3 columnas:
 * HubSpot · Google Meet · Fuentes manuales. Es la materia prima que los agentes usan al
 * generar. Por defecto EXPANDIDO si el handoff no se generó (hace falta ver/curar las
 * fuentes), y COLAPSADO una vez generado (ya pesa menos); el toggle manual manda.
 *
 * Reusa los componentes existentes en `columnMode` (HubspotTimelinePanel,
 * SessionSelectionReview, FuentesManualesColumn). La edición la gatea `canEdit` en el padre
 * (ProjectHandoffSection): el CSE cura el contexto de SUS proyectos. Su gemelo para el
 * CRONOGRAMA (sin la columna de HubSpot) es components/canvas/CronogramaContextSection.tsx.
 */
import { useState, useCallback } from "react";
import HubspotTimelinePanel from "./HubspotTimelinePanel";
import SessionSelectionReview from "./SessionSelectionReview";
import FuentesManualesColumn from "./FuentesManualesColumn";
import { ContextColumn, CTX_ICONS } from "./context-column";

export default function ProjectContextSection({
  projectId,
  canEdit,
  generated,
  onSessionsChange,
}: {
  projectId: string;
  canEdit: boolean;
  generated: boolean;
  /** El padre re-consulta el estado del handoff cuando cambian las sesiones que alimentan. */
  onSessionsChange?: () => void;
}) {
  // Colapso: por defecto colapsado si ya se generó. `override` (toggle manual) manda.
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? !generated;

  // Contadores por columna (los reportan los hijos / la columna manual los sabe directo).
  // Todos miden lo MISMO: "fuentes que alimentan el handoff" — HubSpot y Meet cuentan lo
  // que alimenta (no excluido); las excluidas a mano van aparte.
  const [hubspotCount, setHubspotCountState] = useState(0);
  const [hubspotExcluded, setHubspotExcludedState] = useState(0);
  const [meetCount, setMeetCountState] = useState(0);
  const [meetExcluded, setMeetExcludedState] = useState(0);
  const setHubspotCount = useCallback((n: number) => setHubspotCountState((c) => (c === n ? c : n)), []);
  const setHubspotExcluded = useCallback((n: number) => setHubspotExcludedState((c) => (c === n ? c : n)), []);
  const setMeetCount = useCallback((n: number) => setMeetCountState((c) => (c === n ? c : n)), []);
  const setMeetExcluded = useCallback((n: number) => setMeetExcludedState((c) => (c === n ? c : n)), []);

  // Fuentes manuales: las gestiona FuentesManualesColumn (compartida con el contexto del
  // cronograma); acá solo se lleva la cuenta para el encabezado.
  const [manualCount, setManualCountState] = useState(0);
  const setManualCount = useCallback((n: number) => setManualCountState((c) => (c === n ? c : n)), []);

  // "Alimentan" = todo lo que entra al handoff (mismo criterio en las 3 columnas). Las
  // excluidas a mano (Meet + HubSpot) se cuentan aparte (no alimentan, pero son gestionables).
  const feedTotal = hubspotCount + meetCount + manualCount;
  const excludedTotal = meetExcluded + hubspotExcluded;
  const dot = (color: string) => <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />;

  return (
    <div className="border-t border-line">
      {/* Header colapsable */}
      <button
        onClick={() => setOverride(!open)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-5 py-3 hover:bg-surface-hover transition-colors text-left"
      >
        <svg className={`w-4 h-4 text-fg-secondary flex-shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        <span className="text-sm font-bold text-fg">Contexto</span>
        <span className="text-[11px] text-fg-muted">
          {feedTotal} fuente{feedTotal === 1 ? "" : "s"} alimentan
          {excludedTotal > 0 ? ` · ${excludedTotal} excluida${excludedTotal === 1 ? "" : "s"}` : ""}
        </span>
        <span className="hidden sm:flex items-center gap-3 ml-2 text-[11px] text-fg-secondary">
          <span className="inline-flex items-center gap-1" title="HubSpot (alimentan)">{dot("#ff7a59")}{hubspotCount}</span>
          <span className="inline-flex items-center gap-1" title="Google Meet (alimentan)">{dot("#16a34a")}{meetCount}</span>
          <span className="inline-flex items-center gap-1" title="Fuentes manuales">{dot("#7c6df2")}{manualCount}</span>
        </span>
        <span className="ml-auto text-xs text-fg-muted">{open ? "Colapsar" : "Expandir"}</span>
      </button>

      {/* Cuerpo: 3 columnas. Siempre montado (los contadores del header valen colapsado);
          se oculta con `hidden` para no desmontar y re-fetchear al togglear. */}
      <div className={open ? "px-5 pb-4" : "hidden"}>
        <p className="text-[11px] text-fg-muted mb-2.5">
          Estas fuentes arman el handoff. Todo lo <span className="font-medium text-fg-secondary">incluido</span> alimenta la
          generación; <span className="font-medium text-fg-secondary">excluye</span> lo que sea de otro proyecto. En HubSpot,
          el material de la era del proyecto; el resto queda como trasfondo.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ContextColumn icon={CTX_ICONS.hubspot} color="#ff7a59" title="HubSpot" count={hubspotCount}>
            <HubspotTimelinePanel
              projectId={projectId}
              columnMode
              onCount={setHubspotCount}
              onExcludedCount={setHubspotExcluded}
              canEdit={canEdit}
            />
          </ContextColumn>

          <ContextColumn icon={CTX_ICONS.meet} color="#16a34a" title="Google Meet" count={meetCount}>
            <SessionSelectionReview
              projectId={projectId}
              columnMode
              onCount={setMeetCount}
              onExcludedCount={setMeetExcluded}
              onChange={onSessionsChange}
              readOnly={!canEdit}
            />
          </ContextColumn>

          <ContextColumn icon={CTX_ICONS.note} color="#7c6df2" title="Fuentes manuales" count={manualCount}>
            <FuentesManualesColumn
              endpoint={`/api/projects/${projectId}/handoff-sources`}
              canEdit={canEdit}
              onCount={setManualCount}
            />
          </ContextColumn>
        </div>
      </div>
    </div>
  );
}
