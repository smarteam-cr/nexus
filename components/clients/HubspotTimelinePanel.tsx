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

type HsTimelineItem = { type: "NOTE" | "CALL" | "MEETING"; title: string; date: string | null; snippet: string };
const HS_TYPE_LABEL: Record<string, string> = { NOTE: "Nota", CALL: "Llamada", MEETING: "Reunión" };

export default function HubspotTimelinePanel({
  projectId,
  framed = false,
}: {
  projectId: string;
  framed?: boolean;
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
              <li key={i} className="rounded-lg border border-line bg-surface-muted px-3 py-2">
                <p className="text-xs font-medium text-fg truncate">
                  {HS_TYPE_LABEL[it.type] ?? it.type}
                  {it.date ? ` · ${it.date}` : ""}
                  {it.title ? ` · ${it.title}` : ""}
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
