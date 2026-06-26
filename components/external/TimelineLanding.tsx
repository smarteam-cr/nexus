"use client";

/**
 * components/external/TimelineLanding.tsx
 *
 * Render de la página externa PROPIA del cronograma (D.1.5):
 * /external/cronograma. Recibe el shape EXTERNO ya resuelto y filtrado por el
 * chokepoint (getPublishedTimelineForToken) — read-only, sin nada interno.
 *
 * Estructura de la página: titular "Cronograma de proyecto · {cliente}"
 * arriba, el Gantt (TimelineSection SIN su header propio — el titular de la
 * página lo reemplaza), y el "Arrancamos el …" DEBAJO del cronograma.
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

const MAXW = 1024; // mismo ancho que el Gantt de TimelineSection

export default function TimelineLanding({
  clientName,
  clientLogoUrl,
  timeline,
}: {
  clientName: string;
  clientLogoUrl: string | null;
  timeline: ExternalTimelineData;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  useReveal(rootRef, [timeline.phases.length]);

  const start = timeline.anchorStartDate;

  return (
    <div ref={rootRef} className="kickoff-landing">
      {/* Titular de la página (la marca la pone ExternalShell) */}
      <section className="section-light" style={{ padding: "clamp(36px, 5vw, 56px) 24px 0" }}>
        <div style={{ maxWidth: MAXW, margin: "0 auto" }}>
          {clientLogoUrl && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={clientLogoUrl}
                alt={clientName}
                className="reveal"
                style={{ height: 40, width: "auto", maxWidth: 180, objectFit: "contain", display: "block", marginBottom: 18 }}
              />
            </>
          )}
          <h1
            className="font-display display-tight reveal"
            style={{ fontSize: "clamp(26px, 3.6vw, 38px)", color: "var(--text)", lineHeight: 1.15, margin: 0 }}
          >
            Cronograma de proyecto
            <span style={{ color: "var(--text-muted)", fontWeight: 400, margin: "0 10px" }}>·</span>
            <span className="display-italic" style={{ color: "var(--brand-blue)" }}>{clientName}</span>
          </h1>
        </div>
      </section>

      {timeline.phases.length > 0 ? (
        <TimelineSection phases={timeline.phases} anchor={start} showHeader={false} showProgress />
      ) : (
        <section className="section-light" style={{ padding: "32px 24px 24px" }}>
          <div style={{ maxWidth: MAXW, margin: "0 auto" }}>
            <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
              Estamos preparando el cronograma de tu proyecto — pronto vas a verlo acá.
            </p>
          </div>
        </section>
      )}

      {/* Fecha de arranque — DEBAJO del cronograma */}
      <section className="section-light" style={{ padding: "0 24px clamp(40px, 6vw, 72px)" }}>
        <div style={{ maxWidth: MAXW, margin: "0 auto" }}>
          <p className="reveal" style={{ color: "var(--text-secondary)", fontSize: 14, margin: 0 }}>
            {start ? `Arrancamos el ${fmtFull(start)}.` : "Fecha de arranque por definir."}
          </p>
        </div>
      </section>
    </div>
  );
}
