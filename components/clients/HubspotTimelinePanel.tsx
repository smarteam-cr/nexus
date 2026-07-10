"use client";

/**
 * Panel "Detectado en HubSpot" — espejo del de Business Cases (BusinessCaseWorkspace).
 * Muestra el timeline del registro de empresa (notas + llamadas/reuniones con transcript/
 * resumen de Zoom). Esas fuentes se usan automáticamente como contexto al generar los
 * canvases de proyecto (handoff/diagnóstico → y el cronograma inicial). A nivel EMPRESA,
 * así que una sola instancia informa la generación de cualquier canvas del proyecto.
 *
 * `framed`: false (default) = sección con `border-t` (igual que BC, para el bloque de
 * fuentes del handoff). true = card autocontenida (para el área de canvases kickoff/diag).
 * En ambos casos NO renderiza nada si no hay ítems (no deja cards vacías).
 */
import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/api/fetch-json";
import { ContextColumnList, ContextRow, CTX_ICONS } from "./context-column";

type HsTimelineItem = {
  type: "NOTE" | "CALL" | "MEETING";
  title: string;
  date: string | null;
  snippet: string;
  /** true = anterior a la era del proyecto (trasfondo comprimido — se muestra atenuado). */
  previous?: boolean;
};
const HS_TYPE_LABEL: Record<string, string> = { NOTE: "Nota", CALL: "Llamada", MEETING: "Reunión" };

export default function HubspotTimelinePanel({
  projectId,
  framed = false,
  columnMode = false,
  onCount,
}: {
  projectId: string;
  framed?: boolean;
  /** Render compacto para la columna de "Contexto" (sin header ni border-t propios). */
  columnMode?: boolean;
  /** Reporta la cantidad de ítems (para el contador del header de Contexto). */
  onCount?: (n: number) => void;
}) {
  const [hubspot, setHubspot] = useState<HsTimelineItem[]>([]);
  const [loadingHs, setLoadingHs] = useState(true);

  const load = useCallback(async () => {
    try {
      const d = await fetchJson<{ items: HsTimelineItem[] }>(`/api/projects/${projectId}/hubspot-timeline`);
      setHubspot(d.items);
    } catch {
      /* silencioso — sin HubSpot, el panel no aparece */
    } finally {
      setLoadingHs(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!loadingHs) onCount?.(hubspot.length);
  }, [loadingHs, hubspot.length, onCount]);

  // Modo columna (Contexto): lista compacta + estado vacío, sin header ni borde propios.
  if (columnMode) {
    return (
      <ContextColumnList loading={loadingHs} empty="Sin actividad en HubSpot.">
        {hubspot.map((it, i) => (
          <ContextRow
            key={i}
            icon={it.type === "NOTE" ? CTX_ICONS.note : CTX_ICONS.calendar}
            meta={`${HS_TYPE_LABEL[it.type] ?? it.type}${it.date ? ` · ${it.date}` : ""}${it.previous ? " · historial previo" : ""}`}
            title={it.title}
            snippet={it.snippet}
          />
        ))}
      </ContextColumnList>
    );
  }

  // Igual que BC: visible mientras carga (skeleton) y, ya cargado, solo si hay ítems.
  if (!loadingHs && hubspot.length === 0) return null;

  const body = (
    <div className={`${framed ? "" : "border-t border-line "}px-5 py-3 space-y-2`}>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#ff7a59" }} />
        <p className="text-xs font-semibold text-fg">
          Detectado en HubSpot{hubspot.length > 0 ? ` (${hubspot.length})` : ""}
        </p>
      </div>
      {loadingHs ? (
        <div className="h-10 rounded-lg skeleton-shimmer" />
      ) : (
        <>
          <p className="text-[11px] text-fg-muted">
            Llamadas, reuniones y notas del registro de empresa. Se usan automáticamente como contexto al generar.
          </p>
          <ul className="space-y-2">
            {hubspot.map((it, i) => (
              <li
                key={i}
                className={`rounded-lg border border-line bg-surface-muted px-3 py-2${it.previous ? " opacity-60" : ""}`}
              >
                <p className="text-xs font-medium text-fg truncate">
                  {HS_TYPE_LABEL[it.type] ?? it.type}
                  {it.date ? ` · ${it.date}` : ""}
                  {it.title ? ` · ${it.title}` : ""}
                  {it.previous && (
                    <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider text-fg-muted bg-surface border border-line rounded-full px-1.5 py-0.5 align-middle">
                      historial previo
                    </span>
                  )}
                </p>
                {it.snippet && <p className="text-[11px] text-fg-muted mt-0.5 line-clamp-2">{it.snippet}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );

  return framed ? <div className="rounded-2xl border border-line bg-surface overflow-hidden">{body}</div> : body;
}
