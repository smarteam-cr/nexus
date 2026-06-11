/**
 * components/canvas/TimelineSection.tsx
 *
 * Sección "Cronograma del proyecto" CLIENT-FACING — compartida por las DOS
 * superficies externas (D.1.5): el landing del Kickoff (KickoffLanding) y la
 * página propia /external/cronograma (TimelineLanding). Presentacional pura:
 * fases + acciones por semana (si vienen), read-only, sin estados ni colores
 * internos. Recibe el shape EXTERNO ya filtrado por los chokepoints — acá no
 * hay nada que ocultar porque nada interno llega.
 *
 * Requisitos del contexto que la monta:
 *   - envolver con className="kickoff-landing" — las clases que usa
 *     (.section-light, .card, .eyebrow, .reveal, .font-display) viven
 *     scopeadas ahí (app/kickoff-landing.css).
 *   - correr useReveal sobre el contenedor (useLandingMotion): las .reveal
 *     arrancan en opacity:0 y aparecen con .is-visible — sin el observer las
 *     tarjetas quedan invisibles.
 */
import type { ReactNode } from "react";
import { addWeeks, fmtDay, plural, computePhaseRanges, fmtPhaseRange } from "@/lib/timeline/weeks";
import type { ExternalTimelinePhase } from "@/lib/external/timeline-view-types";

const MAXW = 760;
const SECTION_PAD = "clamp(40px, 6vw, 72px) 24px";

/** Palabra de acento (italic + azul) — copia local consciente de KickoffLanding. */
function Accent({ children }: { children: ReactNode }) {
  return <span className="display-italic" style={{ color: "var(--brand-blue)" }}>{children}</span>;
}

export default function TimelineSection({
  phases,
  anchor,
}: {
  phases: ExternalTimelinePhase[];
  anchor: string | null;
}) {
  if (!phases.length) return null;
  const sorted = [...phases].sort((a, b) => a.order - b.order);
  const ranges = computePhaseRanges(sorted);
  const rows = sorted.map((p, i) => ({ p, ...ranges[i] }));

  return (
    <section className="section-light" style={{ padding: SECTION_PAD }}>
      <div style={{ maxWidth: MAXW, margin: "0 auto" }}>
        <span className="eyebrow reveal">Hoja de ruta</span>
        <h2 className="font-display display-tight reveal" data-stagger="1" style={{ fontSize: "clamp(24px, 3.4vw, 34px)", color: "var(--text)", lineHeight: 1.15, marginTop: 8, marginBottom: 24 }}>
          Cronograma del <Accent>proyecto</Accent>
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map(({ p, start, end }, i) => {
            const range = fmtPhaseRange(anchor, { start, end });
            return (
              <div key={p.id} className="card reveal" data-stagger={Math.min(5, i + 1)} style={{ display: "flex", gap: 18, alignItems: "baseline", padding: "18px 22px" }}>
                <div className="font-display" style={{ color: "var(--brand-blue)", fontSize: 26, lineHeight: 1, flexShrink: 0, minWidth: 34 }}>
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="font-display" style={{ color: "var(--text)", fontSize: 17, marginBottom: 2 }}>{p.name}</div>
                  <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                    {range}
                    {p.durationWeeks ? ` · ${plural(p.durationWeeks, "semana", "semanas")}` : ""}
                    {p.sessionCount ? ` · ${plural(p.sessionCount, "sesión", "sesiones")}` : ""}
                  </div>
                  {p.notes?.trim() && <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 6 }}>{p.notes}</div>}

                  {/* D.1 — acciones por semana (solo si el CSE confirmó el detalle).
                      Read-only y sin estados/colores: el cliente ve QUÉ haremos
                      cada semana, no el tracking interno. */}
                  {p.tasks && p.tasks.length > 0 && (
                    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                      {Array.from({ length: p.durationWeeks }).map((_, relWeek) => {
                        const weekTasks = p.tasks!.filter((t) => t.weekIndex === relWeek);
                        if (weekTasks.length === 0) return null;
                        const absW = start + relWeek;
                        return (
                          <div key={relWeek}>
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                                color: "var(--text-muted)",
                                borderBottom: "1px dashed var(--border, #e2e8f0)",
                                paddingBottom: 3,
                                marginBottom: 5,
                              }}
                            >
                              Semana {relWeek + 1}
                              {anchor && (
                                <span style={{ fontWeight: 600, marginLeft: 6, opacity: 0.75 }}>
                                  {fmtDay(addWeeks(anchor, absW))} – {fmtDay(addWeeks(anchor, absW + 1))}
                                </span>
                              )}
                            </div>
                            <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3 }}>
                              {weekTasks.map((t, ti) => (
                                <li key={ti} style={{ color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.5 }}>
                                  {t.title}
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
