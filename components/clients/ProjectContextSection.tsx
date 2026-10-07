"use client";

/**
 * components/clients/ProjectContextSection.tsx
 *
 * Sección "Contexto" del proyecto (reemplaza el bloque suelto "Detectado en HubSpot" +
 * selección de sesiones + fuentes manuales). Colapsable (toggle) y en 3 columnas:
 * HubSpot · Google Meet · Fuentes manuales, más una cuarta —«Exploración de venta»— cuando al
 * proyecto le corresponde una (ExploracionDeVentaColumn). Es la materia prima que los agentes usan al
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
import { ExploracionDeVentaResumen, useExploracionDeVenta } from "./ExploracionDeVentaColumn";
import { FilaDeAlrededor } from "./FilaDeAlrededor";

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

  // La exploración de venta de la empresa, si le corresponde a este proyecto: una fuente más.
  const exploracion = useExploracionDeVenta(projectId);
  const exploracionCount = exploracion ? 1 : 0;

  // "Alimentan" = todo lo que entra al handoff (mismo criterio en las 3 columnas). Las
  // excluidas a mano (Meet + HubSpot) se cuentan aparte (no alimentan, pero son gestionables).
  const feedTotal = hubspotCount + meetCount + manualCount + exploracionCount;
  const excludedTotal = meetExcluded + hubspotExcluded;

  return (
    /* La cabecera es la fila común de «Alrededor del handoff» (FilaDeAlrededor). El cuerpo queda
       montado aunque esté plegado: los contadores de la cabecera los reportan las columnas. */
    <FilaDeAlrededor
      titulo="Contexto adicional"
      ayuda={`Lo que leyó el agente: reuniones, notas de HubSpot, fuentes a mano${exploracion ? " y la preventa" : ""}.`}
      meta={`${feedTotal} fuente${feedTotal === 1 ? "" : "s"}${excludedTotal > 0 ? ` · ${excludedTotal} excluida${excludedTotal === 1 ? "" : "s"}` : ""}`}
      abierto={open}
      onAlternar={() => setOverride(!open)}
    >
        <p className="text-xs text-fg-muted mb-2.5">
          Estas fuentes arman el handoff. Todo lo <span className="font-medium text-fg-secondary">incluido</span> alimenta la
          generación; <span className="font-medium text-fg-secondary">excluye</span> lo que sea de otro proyecto. En HubSpot,
          el material de la era del proyecto; el resto queda como trasfondo.
        </p>
        <div className={`grid grid-cols-1 gap-3 ${exploracion ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3"}`}>
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

          {exploracion && (
            <ContextColumn icon={CTX_ICONS.note} color="#d97706" title="Preventa" count={exploracionCount}>
              <ExploracionDeVentaResumen datos={exploracion} />
            </ContextColumn>
          )}
        </div>
    </FilaDeAlrededor>
  );
}
