"use client";

/**
 * components/canvas/KickoffLanding.tsx
 *
 * Render tipo LANDING del canvas "Kickoff" (Camino C). Presenta el contenido
 * curado como una página de bienvenida para el cliente (hero + secciones +
 * banda de cronograma), no como la grilla de bloques de los otros canvases.
 *
 * Componente presentacional reutilizable:
 *   - Fase A (interno): se monta en ProjectCanvasPanel con `editable` → el CSE
 *     revisa, acepta/rechaza y edita los bloques in-situ (reusa useCanvasSections
 *     + BlockRenderer, los mismos endpoints que el resto del canvas).
 *   - Fase C (externo): la misma plantilla con `editable=false` en una ruta
 *     pública (fuera de alcance de esta fase).
 *
 * El CRONOGRAMA NO viene de bloques: se lee directo de ProjectTimeline
 * (GET /api/projects/[id]/timeline) — fuente única, sin duplicar.
 */

import { useEffect, useState } from "react";
import BlockRenderer from "./BlockRenderer";
import { useCanvasSections, type SectionWithBlocks } from "./useCanvasSections";

interface TimelinePhase {
  id: string;
  name: string;
  order: number;
  durationWeeks: number;
  sessionCount: number | null;
  notes: string | null;
  source: string;
}
interface TimelineData {
  exists: boolean;
  anchorStartDate: string | null;
  phases: TimelinePhase[];
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function addWeeks(iso: string, weeks: number): Date {
  const d = new Date(iso);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}
function fmtDate(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function TimelineBand({ timeline }: { timeline: TimelineData | null }) {
  if (!timeline || !timeline.exists || timeline.phases.length === 0) return null;
  const anchor = timeline.anchorStartDate;
  const sorted = [...timeline.phases].sort((a, b) => a.order - b.order);
  let cum = 0;
  const rows = sorted.map((p) => {
    const start = cum;
    cum += p.durationWeeks || 1;
    return { p, startWeek: start + 1, endWeek: cum };
  });

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-white border-b border-gray-800 pb-2">Cronograma</h2>
      <ol className="space-y-2.5">
        {rows.map(({ p, startWeek, endWeek }, i) => {
          const range = anchor
            ? `${fmtDate(addWeeks(anchor, startWeek - 1))} – ${fmtDate(addWeeks(anchor, endWeek))}`
            : `Semana ${startWeek}${endWeek > startWeek ? `–${endWeek}` : ""}`;
          return (
            <li key={p.id} className="flex items-start gap-3 px-4 py-3 rounded-xl bg-gray-900 border border-gray-800">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand/20 text-brand-light text-xs font-bold flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">{p.name}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {range}
                  {p.durationWeeks ? ` · ${p.durationWeeks} sem` : ""}
                  {p.sessionCount ? ` · ${p.sessionCount} sesiones` : ""}
                </div>
                {p.notes?.trim() && <div className="text-xs text-gray-500 mt-1">{p.notes}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default function KickoffLanding({
  projectId,
  canvasId,
  editable = false,
}: {
  projectId: string;
  canvasId: string;
  editable?: boolean;
}) {
  const {
    sections,
    loading,
    draftCount,
    acceptBlock,
    rejectBlock,
    deleteBlock,
    saveBlock,
    addBlock,
    acceptAll,
  } = useCanvasSections(projectId, canvasId);

  const [timeline, setTimeline] = useState<TimelineData | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/timeline`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.exists) {
          setTimeline({ exists: true, anchorStartDate: d.anchorStartDate ?? null, phases: d.phases ?? [] });
        } else {
          setTimeline({ exists: false, anchorStartDate: null, phases: [] });
        }
      })
      .catch(() => setTimeline({ exists: false, anchorStartDate: null, phases: [] }));
  }, [projectId]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-2xl skeleton-shimmer" />
        ))}
      </div>
    );
  }

  const hero = sections.find((s) => s.key === "bienvenida");
  const rest = sections.filter((s) => s.key !== "bienvenida");
  const hasProximos = rest.some((s) => s.key === "proximos_pasos");

  const renderBlocks = (section: SectionWithBlocks) => (
    <div className="space-y-3">
      {section.blocks.map((block) => (
        <div key={block.id} className="group/row flex items-start gap-1.5">
          {editable && (
            <button
              onClick={() => deleteBlock(section.id, block.id)}
              title="Eliminar bloque"
              className="mt-2 flex-shrink-0 p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover/row:opacity-100 transition-opacity"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          <div className="flex-1 min-w-0">
            <BlockRenderer
              block={block}
              onAccept={editable && block.status === "DRAFT" ? () => acceptBlock(section.id, block.id) : undefined}
              onReject={editable && block.status === "DRAFT" ? () => rejectBlock(section.id, block.id) : undefined}
              onSave={editable ? (updates) => saveBlock(section.id, block.id, updates) : undefined}
            />
          </div>
        </div>
      ))}
      {section.blocks.length === 0 && !editable && <p className="text-sm text-gray-500">—</p>}
      {editable && (
        <button
          onClick={() => addBlock(section.id)}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-white transition-colors pt-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Agregar bloque
        </button>
      )}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-12">
      {/* Draft banner (solo en modo edición) */}
      {editable && draftCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-900/20 border border-amber-700/50 text-amber-300">
          <svg className="w-4 h-4 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium">
            {draftCount} {draftCount === 1 ? "bloque nuevo" : "bloques nuevos"} del agente — revisá y aceptá
          </span>
          <button onClick={acceptAll} className="ml-auto text-xs font-semibold text-amber-200 hover:text-white px-2 py-1 rounded hover:bg-amber-800/40">
            Aceptar todos
          </button>
        </div>
      )}

      {/* Hero */}
      <header className="text-center space-y-3 pt-2">
        <span className="inline-block text-[11px] font-semibold uppercase tracking-widest text-brand-light bg-brand/10 px-3 py-1 rounded-full">
          Kickoff
        </span>
        <h1 className="text-3xl font-bold text-white">¡Bienvenido a tu proyecto con Smarteam!</h1>
        {hero && <div className="text-left">{renderBlocks(hero)}</div>}
      </header>

      {/* Secciones del cuerpo; el cronograma va justo antes de "Próximos pasos" */}
      {rest.map((section) => (
        <div key={section.id} className="space-y-8">
          {section.key === "proximos_pasos" && <TimelineBand timeline={timeline} />}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white border-b border-gray-800 pb-2">{section.label}</h2>
            {renderBlocks(section)}
          </section>
        </div>
      ))}

      {/* Si no hay sección "Próximos pasos", el cronograma va al final */}
      {!hasProximos && <TimelineBand timeline={timeline} />}
    </div>
  );
}
