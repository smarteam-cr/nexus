"use client";

/**
 * components/canvas/TimelineSection.tsx
 *
 * Cronograma CLIENT-FACING con la ESTRUCTURA del Gantt interno (TimelineGantt):
 * banner de hoy + leyenda de tipos + grilla de semanas + filas de fase
 * expandibles con las acciones por semana — pero con los TONOS del design
 * system del landing (tokens de kickoff-landing.css), no el tema oscuro
 * interno. Estilos INLINE a propósito: este árbol no puede usar utilidades de
 * gris de Tailwind (los overrides light de Nexus las pisarían — regla del
 * design system del landing).
 *
 * Compartido por el landing del Kickoff y la página /external/cronograma.
 * Recibe el shape EXTERNO ya filtrado por los chokepoints: fases con su tipo
 * de actividad (cruza by-design D.1.5 — colorea barras, chips y leyenda) y
 * tareas {title, weekIndex, status, party}. Con showProgress=true (solo la página
 * compartible del cronograma) se muestran el estado (hecho/en curso/pendiente +
 * "atrasada") y el responsable (Cliente/Smarteam/Ambos). JAMÁS llegan notas de
 * tarea, source ni needsValidation; las tareas SUSPENDED se excluyen del shape.
 *
 * Requisitos del contexto que la monta: wrapper .kickoff-landing + useReveal
 * sobre el contenedor (las .reveal arrancan opacity:0).
 */
import { useState } from "react";
import { useHydrated } from "@/lib/hooks/useHydrated";
import {
  addWeeks,
  fmtDay,
  fmtFull,
  fmtLocalDay,
  plural,
  computePhaseRanges,
  timelineSpan,
  fmtPhaseRange,
  currentWeekIndex,
  absoluteWeek,
  overduePlannedEnd,
  isOverdueByDate,
} from "@/lib/timeline/weeks";
import { collectClientBlockers } from "@/lib/timeline/client-blockers";
import { summarizeParticularidades, attributionSentence } from "@/lib/timeline/particularidades-summary";
import { clientStatusLine } from "@/lib/timeline/client-status";
import type { ExternalTimelinePhase, ExternalParticularidad } from "@/lib/external/timeline-view-types";

const MAXW = 1024; // el Gantt necesita ancho — bloque deliberadamente más ancho que las secciones de texto (760)
const SECTION_PAD = "clamp(40px, 6vw, 72px) 24px";

// Misma paleta de tipos que el Gantt interno, en sus variantes light (los
// mismos hex que los overrides light de Nexus) — el chrome alrededor usa los
// tokens del landing.
const ACTIVITY_META: Record<
  string,
  { label: string; seg: string; chipText: string; chipBg: string; chipBorder: string }
> = {
  EXPLORACION:   { label: "Exploración",   seg: "#0ea5e9", chipText: "#0369a1", chipBg: "#f0f9ff", chipBorder: "#bae6fd" },
  PLANIFICACION: { label: "Planificación", seg: "#8b5cf6", chipText: "#6d28d9", chipBg: "#f5f3ff", chipBorder: "#ddd6fe" },
  CONFIGURACION: { label: "Configuración", seg: "#f97316", chipText: "#c2410c", chipBg: "#fff7ed", chipBorder: "#fed7aa" },
  ADOPCION:      { label: "Adopción",      seg: "#10b981", chipText: "#065f46", chipBg: "#ecfdf5", chipBorder: "#a7f3d0" },
  SEGUIMIENTO:   { label: "Seguimiento",   seg: "#d946ef", chipText: "#a21caf", chipBg: "#fdf4ff", chipBorder: "#f5d0fe" },
};
const NEUTRAL_SEG = "#CBD5E1"; // fase sin tipo
const EMPTY_CELL = "#EEF1F4"; // semana fuera del rango de la fase

// Estado + responsable por tarea (showProgress, solo el cronograma compartible) — paleta light
// del landing, espejo de STATUS_META/PARTY_META del Gantt interno. "atrasada" se deriva (isOverdue).
const STATUS_META_LIGHT: Record<string, { label: string; text: string; bg: string; border: string }> = {
  PENDING:     { label: "pendiente", text: "#475569", bg: "#f1f5f9", border: "#e2e8f0" },
  IN_PROGRESS: { label: "en curso",  text: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe" },
  DONE:        { label: "hecho",     text: "#047857", bg: "#ecfdf5", border: "#a7f3d0" },
};
const OVERDUE_META_LIGHT = { label: "atrasada", text: "#b91c1c", bg: "#fef2f2", border: "#fecaca" };
// Tipo de tarea: solo se muestra cuando es SESIÓN (las TAREAS no muestran nada).
const SESSION_META_LIGHT = { label: "Sesión", text: "#0f766e", bg: "#f0fdfa", border: "#99f6e4" };
const PARTY_META_LIGHT: Record<string, { label: string; text: string; bg: string; border: string }> = {
  CLIENTE:  { label: "Cliente",  text: "#b45309", bg: "#fffbeb", border: "#fde68a" }, // ámbar — lo que entrega el cliente
  SMARTEAM: { label: "Smarteam", text: "#0369a1", bg: "#f0f9ff", border: "#bae6fd" }, // celeste
  AMBOS:    { label: "Ambos",    text: "#6d28d9", bg: "#f5f3ff", border: "#ddd6fe" }, // violeta
  DEV:      { label: "Dev",      text: "#3730a3", bg: "#eef2ff", border: "#c7d2fe" }, // índigo — desarrollo/integración
};
const chipStyle = (m: { text: string; bg: string; border: string }): React.CSSProperties => ({
  fontSize: 9,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  padding: "1px 6px",
  borderRadius: 6,
  color: m.text,
  background: m.bg,
  border: `1px solid ${m.border}`,
  flexShrink: 0,
  whiteSpace: "nowrap",
});

const SUB_LABEL: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-muted)",
};

// Tipo de PARTICULARIDAD, tema light. Etiquetas en LENGUAJE CLIENTE: el interno dice "Atraso /
// Compromiso" (vocabulario de equipo); acá se dice qué le pasó al plan, en verbo y sin jerga.
const KIND_META_LIGHT: Record<string, { label: string; text: string; bg: string; border: string }> = {
  ATRASO:     { label: "Se atrasó", text: "#b91c1c", bg: "#fef2f2", border: "#fecaca" }, // rojo
  SOLICITUD:  { label: "En espera", text: "#b45309", bg: "#fffbeb", border: "#fde68a" }, // ámbar (legacy)
  COMPROMISO: { label: "Acordado",  text: "#0f766e", bg: "#f0fdfa", border: "#99f6e4" }, // verde
};

export default function TimelineSection({
  phases,
  anchor,
  showHeader = true,
  showProgress = false,
  particularidades,
}: {
  phases: ExternalTimelinePhase[];
  anchor: string | null;
  /** false = sin eyebrow/título propios (la página standalone pone el suyo). */
  showHeader?: boolean;
  /** true = muestra estado (hecho/en curso/pendiente + atrasada) y responsable por tarea. Solo el cronograma compartible. */
  showProgress?: boolean;
  /** Desviaciones curadas visibles al cliente (visibleExternal=true, ya filtradas en el chokepoint).
   *  Solo se renderiza con showProgress (el cronograma compartible, no el kickoff embebido). */
  particularidades?: ExternalParticularidad[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // "Hoy" es hora de pared del USUARIO: calcularlo en el server rompería la
  // hidratación (lo evalúa en otro instante y en otra zona horaria, y `curInRange`
  // gatea nodos → cambia la ESTRUCTURA, no solo el texto). SSR y primer paint pintan
  // la variante neutra (sin chip "Hoy" ni resaltado de la semana actual).
  const hydrated = useHydrated();
  const now = hydrated ? new Date() : null;

  if (!phases.length) return null;
  const sorted = [...phases].sort((a, b) => a.order - b.order);
  const ranges = computePhaseRanges(sorted);
  const total = timelineSpan(sorted);
  if (total === 0) return null;

  const curWeek = now ? currentWeekIndex(anchor, now) : null;
  const curInRange = curWeek !== null && curWeek >= 0 && curWeek < total;

  // ── Estado del proyecto en lenguaje cliente ──────────────────────────────────
  // Antes esta vista solo hablaba cuando algo estaba mal: si el proyecto iba bien, el cliente no leía
  // una sola palabra. Esta línea existe SIEMPRE (avance + si vamos al día), y de paso reemplaza el
  // "cronograma finalizado" que se disparaba solo por fecha aunque quedaran tareas sin hacer.
  const allTasks = sorted.flatMap((p) => p.tasks ?? []);
  const tasksDone = allTasks.filter((t) => t.status === "DONE").length;
  const desvioSemanas = summarizeParticularidades(particularidades ?? []).totalWeeks;
  const statusLine = showProgress
    ? clientStatusLine({ curWeek, totalWeeks: total, tasksDone, tasksTotal: allTasks.length, delayWeeks: desvioSemanas })
    : null;
  // Fecha de cierre proyectada: convierte un número de atraso en un compromiso. Sale de lo que ya
  // está en pantalla (anchor + span), sin datos nuevos ni cambios en lo que cruza al cliente.
  const closingDate = anchor ? fmtFull(addWeeks(anchor, total).toISOString()) : null;

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const gridCols = { gridTemplateColumns: `minmax(200px, 280px) repeat(${total}, minmax(26px, 1fr))` };

  return (
    <section className="section-light" style={{ padding: SECTION_PAD }}>
      <div style={{ maxWidth: MAXW, margin: "0 auto" }}>
        {showHeader && (
          <>
            <span className="eyebrow reveal">Hoja de ruta</span>
            <h2 className="font-display display-tight reveal" data-stagger="1" style={{ fontSize: "clamp(24px, 3.4vw, 34px)", color: "var(--text)", lineHeight: 1.15, marginTop: 8, marginBottom: 24 }}>
              Cronograma del <span className="display-italic" style={{ color: "var(--brand-blue)" }}>proyecto</span>
            </h2>
          </>
        )}

        {/* Banner de hoy + leyenda de tipos (estructura del Gantt interno) */}
        <div className="reveal" data-stagger="2" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 16px", marginBottom: 14 }}>
          {/* Solo tras montar (`now`): en SSR no se pinta → sin hydration mismatch. */}
          {now && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                fontWeight: 700,
                color: "var(--brand-blue-dark)",
                background: "var(--brand-blue-soft)",
                border: "1px solid rgba(22, 140, 246, 0.3)",
                borderRadius: 10,
                padding: "6px 12px",
              }}
            >
              {curInRange && (
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--brand-blue)", flexShrink: 0 }} />
              )}
              Hoy: {fmtLocalDay(now)}
              {curInRange && <span style={{ fontWeight: 800 }}>· Semana S{curWeek as number}</span>}
              {anchor && curWeek !== null && curWeek < 0 && (
                <span style={{ fontWeight: 600, opacity: 0.85 }}>· el proyecto arranca el {fmtFull(anchor)}</span>
              )}
              {/* El viejo "· cronograma finalizado" se disparaba SOLO por fecha: podía anunciar que el
                  proyecto terminó con tareas sin hacer. Ahora lo dice clientStatusLine, que mira el estado real. */}
              {statusLine && <span style={{ fontWeight: 600, opacity: 0.85 }}>· {statusLine}</span>}
            </span>
          )}

          <span style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 16px" }}>
            {Object.values(ACTIVITY_META).map((m) => (
              <span key={m.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 24, height: 6, borderRadius: 3, background: m.seg, display: "inline-block" }} />
                <span style={SUB_LABEL}>{m.label}</span>
              </span>
            ))}
          </span>
        </div>

        {/* La grilla */}
        <div className="reveal" data-stagger="3" style={{ border: "1px solid var(--border)", borderRadius: 16, background: "var(--bg)", overflowX: "auto" }}>
          <div style={{ minWidth: Math.max(640, 280 + total * 34) }}>
            {/* Cabecera de semanas */}
            <div style={{ ...gridCols, display: "grid", gap: 4, alignItems: "center", padding: "10px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg-soft)" }}>
              <div style={SUB_LABEL}>Fase</div>
              {Array.from({ length: total }).map((_, w) => {
                const isCur = curWeek === w;
                return (
                  <div
                    key={w}
                    style={{
                      textAlign: "center",
                      lineHeight: 1.25,
                      borderRadius: 6,
                      padding: "2px 0",
                      ...(isCur ? { background: "var(--brand-blue-soft)", boxShadow: "inset 0 0 0 1px rgba(22, 140, 246, 0.45)" } : {}),
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 700, color: isCur ? "var(--brand-blue-dark)" : "var(--text-muted)" }}>S{w}</div>
                    {anchor && <div style={{ fontSize: 9, color: "var(--text-muted)" }}>{fmtDay(addWeeks(anchor, w))}</div>}
                  </div>
                );
              })}
            </div>

            {/* Filas de fases */}
            <div style={{ padding: "8px 16px" }}>
              {sorted.map((p, i) => {
                const range = ranges[i];
                const meta = p.activityType ? ACTIVITY_META[p.activityType] : null;
                const isOpen = expanded.has(p.id);
                const tasks = p.tasks ?? [];
                const hasDetail = tasks.length > 0 || !!p.notes?.trim();

                const tasksByWeek = new Map<number, typeof tasks>();
                for (const t of tasks) {
                  const arr = tasksByWeek.get(t.weekIndex) ?? [];
                  arr.push(t);
                  tasksByWeek.set(t.weekIndex, arr);
                }

                return (
                  <div key={p.id}>
                    <div
                      onClick={() => hasDetail && toggleExpand(p.id)}
                      style={{ ...gridCols, display: "grid", gap: 4, alignItems: "center", padding: "7px 0", cursor: hasDetail ? "pointer" : "default" }}
                    >
                      <div style={{ minWidth: 0, paddingRight: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          {hasDetail ? (
                            <svg
                              style={{ width: 12, height: 12, color: "var(--text-muted)", flexShrink: 0, transition: "transform 0.15s", transform: isOpen ? "rotate(90deg)" : "none" }}
                              fill="none" viewBox="0 0 24 24" stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                            </svg>
                          ) : (
                            <span style={{ width: 12, flexShrink: 0 }} />
                          )}
                          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                          {meta && (
                            <span
                              style={{
                                fontSize: 9,
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                padding: "2px 7px",
                                borderRadius: 6,
                                color: meta.chipText,
                                background: meta.chipBg,
                                border: `1px solid ${meta.chipBorder}`,
                                flexShrink: 0,
                              }}
                            >
                              {meta.label}
                            </span>
                          )}
                        </div>
                        <div style={{ marginLeft: 19, marginTop: 2, fontSize: 11, color: "var(--text-muted)" }}>
                          {fmtPhaseRange(anchor, range)}
                          {tasks.length > 0 && ` · ${plural(tasks.length, "tarea", "tareas")}`}
                        </div>
                      </div>

                      {/* Celdas de semanas */}
                      {Array.from({ length: total }).map((_, w) => {
                        const inRange = w >= range.start && w < range.end;
                        if (!inRange) return <div key={w} style={{ height: 12, borderRadius: 6, background: EMPTY_CELL }} />;
                        const isPast = curWeek !== null && w < curWeek;
                        const isCur = curWeek === w;
                        return (
                          <div
                            key={w}
                            title={`S${w}`}
                            style={{
                              height: 12,
                              borderRadius: 6,
                              background: meta?.seg ?? NEUTRAL_SEG,
                              opacity: isPast ? 0.35 : 1,
                              ...(isCur ? { boxShadow: "0 0 0 2px rgba(22, 140, 246, 0.75)" } : {}),
                            }}
                          />
                        );
                      })}
                    </div>

                    {/* Expandido: notas de fase + acciones por semana (read-only) */}
                    {isOpen && hasDetail && (
                      <div style={{ marginLeft: 26, marginRight: 8, marginTop: 2, marginBottom: 12, borderLeft: "2px solid var(--border)", paddingLeft: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                        {p.notes?.trim() && (
                          <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55 }}>{p.notes}</p>
                        )}
                        {Array.from({ length: p.durationWeeks }).map((_, relWeek) => {
                          const weekTasks = tasksByWeek.get(relWeek) ?? [];
                          if (weekTasks.length === 0) return null;
                          const absW = absoluteWeek(range.start, relWeek);
                          return (
                            <div key={relWeek}>
                              <div style={{ ...SUB_LABEL, borderBottom: "1px dashed var(--border)", paddingBottom: 3, marginBottom: 5 }}>
                                Semana {relWeek + 1}
                                <span style={{ fontWeight: 600, marginLeft: 6, opacity: 0.8 }}>
                                  S{absW}
                                  {anchor && ` · ${fmtDay(addWeeks(anchor, absW))} – ${fmtDay(addWeeks(anchor, absW + 1))}`}
                                </span>
                              </div>
                              <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5 }}>
                                {weekTasks.map((t, ti) => {
                                  const sMeta = showProgress && t.status ? STATUS_META_LIGHT[t.status] : null;
                                  const overdue = showProgress && !!t.status && isOverdueByDate(overduePlannedEnd(anchor, range.start, relWeek), now, t.status);
                                  const pMeta = showProgress && t.party ? PARTY_META_LIGHT[t.party] : null;
                                  return (
                                    <li key={ti} style={{ color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.5, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                                      <span>{t.title}</span>
                                      {sMeta && <span style={chipStyle(sMeta)}>{sMeta.label}</span>}
                                      {overdue && <span style={chipStyle(OVERDUE_META_LIGHT)}>{OVERDUE_META_LIGHT.label}</span>}
                                      {pMeta && <span style={chipStyle(pMeta)}>{pMeta.label}</span>}
                                      {showProgress && t.type === "SESSION" && <span style={chipStyle(SESSION_META_LIGHT)}>{SESSION_META_LIGHT.label}</span>}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Pendiente de tu parte — tareas del CLIENTE atrasadas. Solo con showProgress (cronograma
            vivo, no el kickoff) y tras hidratar (necesita el "hoy" del cliente). Sin atrasos → no se
            muestra.
            NOTA (reorder DIFERIDO): el reorder de particularidades ARRIBA de este bloque se pospuso a
            propósito. Los snapshots publicados de Spectrum y Wherex ya traen particularidades legacy
            visibles (SOLICITUD/ATRASO-sin-weeks) que el cliente ve HOY; subirlas de nivel agravaría la
            duplicación. El reorder se hace DESPUÉS del triage + republicación de esos proyectos, cuando
            el bloque solo tenga desviaciones reales. */}
        {showProgress && (() => {
          const blockers = collectClientBlockers(phases, anchor, now);
          if (blockers.length === 0) return null;
          return (
            <div
              className="reveal"
              style={{
                marginTop: 28,
                padding: "18px 20px",
                borderRadius: 16,
                background: OVERDUE_META_LIGHT.bg,
                border: `1px solid ${OVERDUE_META_LIGHT.border}`,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Pendiente de tu parte</div>
              <p style={{ margin: "4px 0 14px", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                Para seguir avanzando necesitamos esto de tu parte:
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                {blockers.map((b, i) => (
                  <li key={i} style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, fontSize: 13, color: "var(--text)" }}>
                    <span style={{ fontWeight: 600 }}>{b.task.title}</span>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{b.phaseName}</span>
                    {b.dueDateIso && (
                      <span style={{ fontSize: 12, color: OVERDUE_META_LIGHT.text, fontWeight: 600 }}>
                        vencía el {fmtFull(b.dueDateIso)}
                      </span>
                    )}
                    <span style={chipStyle(PARTY_META_LIGHT.CLIENTE)}>{PARTY_META_LIGHT.CLIENTE.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}

        {/* Particularidades — por qué y quién movió el cronograma. Resumen con atribución
            (corrimiento acumulado por responsable) + bitácora legible. Solo con showProgress
            (el cronograma compartible) y solo las visibleExternal (ya filtradas en el chokepoint).
            SOLICITUD queda como fallback de render para filas legacy. */}
        {showProgress && (() => {
          const parts = particularidades ?? [];
          if (parts.length === 0) return null;
          const summary = summarizeParticularidades(parts);
          // audience "cliente": SIN reparto de responsables, y cerrando con la fecha nueva — un número
          // de atraso sin fecha de cierre es ansiedad sin salida; con fecha, es un compromiso.
          const sentence = attributionSentence(summary, { audience: "cliente", closingDate });
          return (
            <div
              className="reveal"
              style={{
                marginTop: 28,
                padding: "18px 20px",
                borderRadius: 16,
                background: "var(--surface-2, #f8fafc)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Qué cambió en el plan</div>
              {sentence && (
                <p style={{ margin: "6px 0 14px", fontSize: 14, color: "var(--text)", lineHeight: 1.55, fontWeight: 500 }}>{sentence}</p>
              )}
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                {parts.map((pt, i) => {
                  const kMeta = KIND_META_LIGHT[pt.kind] ?? { label: pt.kind, text: "var(--text-muted)", bg: "var(--surface-2, #f1f5f9)", border: "var(--border)" };
                  // SIN chip de responsable: acá `party` es "quién causó el atraso" y del lado del
                  // cliente eso es un marcador de faltas. La atribución queda interna (el CSE la ve
                  // completa en el Gantt). En las TAREAS el chip sí se queda: ahí significa "quién lo
                  // hace" y le sirve al cliente para saber qué le toca.
                  return (
                    <li key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, fontSize: 13, color: "var(--text)" }}>
                        <span style={chipStyle(kMeta)}>{kMeta.label}</span>
                        <span style={{ fontWeight: 600 }}>{pt.title}</span>
                        {pt.weeksImpact != null && pt.weeksImpact > 0 && (
                          <span style={{ fontSize: 12, color: OVERDUE_META_LIGHT.text, fontWeight: 600 }}>
                            +{pt.weeksImpact} {pt.weeksImpact === 1 ? "semana" : "semanas"}
                          </span>
                        )}
                      </div>
                      {pt.detail && (
                        <p style={{ margin: 0, paddingLeft: 2, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>{pt.detail}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })()}
      </div>
    </section>
  );
}
