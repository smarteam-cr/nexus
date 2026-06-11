"use client";

/**
 * components/external/TimelineLanding.tsx
 *
 * Render de la página externa PROPIA del cronograma (D.1.5):
 * /external/cronograma. Recibe el shape EXTERNO ya resuelto y filtrado por el
 * chokepoint (getPublishedTimelineForToken) — read-only, sin nada interno.
 *
 * Es el wrapper que cumple los dos requisitos de TimelineSection:
 *   - className="kickoff-landing": scope del design system de landing
 *     (app/kickoff-landing.css — nombre histórico, lo usan ambas superficies).
 *   - useReveal sobre el contenedor: las .reveal arrancan en opacity:0 y
 *     aparecen con .is-visible — sin el observer quedarían invisibles.
 */
import { useRef } from "react";
import TimelineSection from "@/components/canvas/TimelineSection";
import { useReveal } from "@/components/canvas/useLandingMotion";
import { fmtFull } from "@/lib/timeline/weeks";
import type { ExternalTimelineData } from "@/lib/external/timeline-view-types";

export default function TimelineLanding({
  projectName,
  timeline,
}: {
  projectName: string;
  timeline: ExternalTimelineData;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  useReveal(rootRef, [timeline.phases.length]);

  const start = timeline.anchorStartDate;

  return (
    <div ref={rootRef} className="kickoff-landing">
      {/* Mini-hero: proyecto + fecha de arranque (la marca la pone ExternalShell) */}
      <section className="section-light" style={{ padding: "clamp(36px, 5vw, 56px) 24px 0" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <span className="eyebrow reveal">{projectName}</span>
          <p className="reveal" data-stagger="1" style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 10, marginBottom: 0 }}>
            {start ? `Arrancamos el ${fmtFull(start)}.` : "Fecha de arranque por definir."}
          </p>
        </div>
      </section>

      {timeline.phases.length > 0 ? (
        <TimelineSection phases={timeline.phases} anchor={start} />
      ) : (
        <section className="section-light" style={{ padding: "32px 24px 72px" }}>
          <div style={{ maxWidth: 760, margin: "0 auto" }}>
            <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
              Estamos preparando el cronograma de tu proyecto — pronto vas a verlo acá.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
