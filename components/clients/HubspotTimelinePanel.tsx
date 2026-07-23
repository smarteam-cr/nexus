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
  /** Id estable del engagement (v1) — para excluir/re-incluir el ítem por-handoff. */
  id: string;
  type: "NOTE" | "CALL" | "MEETING";
  title: string;
  date: string | null;
  snippet: string;
  /** true = anterior a la era del proyecto (entra resumido como trasfondo). */
  previous?: boolean;
  /** true = sacado a mano del handoff con la "X". */
  excluded?: boolean;
};
const HS_TYPE_LABEL: Record<string, string> = { NOTE: "Nota", CALL: "Llamada", MEETING: "Reunión" };

export default function HubspotTimelinePanel({
  projectId,
  framed = false,
  columnMode = false,
  onCount,
  onExcludedCount,
  canEdit = false,
}: {
  projectId: string;
  framed?: boolean;
  /** Render compacto para la columna de "Contexto" (sin header ni border-t propios). */
  columnMode?: boolean;
  /** Reporta la cantidad de ítems que ALIMENTAN (no excluidos) — contador del header. */
  onCount?: (n: number) => void;
  /** Reporta la cantidad de ítems excluidos a mano — contador honesto del header. */
  onExcludedCount?: (n: number) => void;
  /** Habilita la "X" (excluir) / "Incluir". Solo columnMode. */
  canEdit?: boolean;
}) {
  const [hubspot, setHubspot] = useState<HsTimelineItem[]>([]);
  const [loadingHs, setLoadingHs] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const setExcluded = useCallback(
    async (engagementId: string, excluded: boolean) => {
      setBusyId(engagementId);
      try {
        const r = await fetch(`/api/projects/${projectId}/hubspot-timeline/exclude`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ engagementId, excluded }),
        });
        if (r.ok) await load();
      } catch {
        /* ignore — best-effort */
      }
      setBusyId(null);
    },
    [projectId, load],
  );

  // Contador HONESTO: TODAS las reuniones/notas de HubSpot alimentan (era completas,
  // previas resumidas como trasfondo) salvo las excluidas a mano con la "X".
  const feedingCount = hubspot.filter((it) => !it.excluded).length;
  const excludedCount = hubspot.filter((it) => it.excluded).length;
  useEffect(() => {
    if (!loadingHs) {
      onCount?.(feedingCount);
      onExcludedCount?.(excludedCount);
    }
  }, [loadingHs, feedingCount, excludedCount, onCount, onExcludedCount]);

  // Modo columna (Contexto): igual que Google Meet — todo INCLUIDO por defecto con badge
  // (era "Material", previo "Trasfondo") y la "X" para excluir; los excluidos van atenuados
  // con "Incluir" para revertir. NO se copian a fuentes manuales: siguen siendo de HubSpot.
  if (columnMode) {
    return (
      <ContextColumnList loading={loadingHs} empty="Sin actividad en HubSpot.">
        {hubspot.map((it, i) => {
          const isExc = !!it.excluded;
          return (
            <ContextRow
              key={it.id || i}
              icon={it.type === "NOTE" ? CTX_ICONS.note : CTX_ICONS.calendar}
              meta={`${HS_TYPE_LABEL[it.type] ?? it.type}${it.date ? ` · ${it.date}` : ""}`}
              title={it.title}
              snippet={it.snippet}
              dim={isExc}
              badge={
                isExc
                  ? { label: "Excluida", tone: "muted" }
                  : it.previous
                    ? { label: "Trasfondo", tone: "muted" }
                    : { label: "Material", tone: "green" }
              }
              action={
                canEdit && isExc && it.id
                  ? { label: "Incluir", onClick: () => setExcluded(it.id, false), disabled: busyId === it.id }
                  : undefined
              }
              onRemove={canEdit && !isExc && it.id ? () => setExcluded(it.id, true) : undefined}
              removeTitle="Excluir del handoff"
            />
          );
        })}
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
