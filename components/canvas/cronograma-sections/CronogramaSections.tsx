/**
 * components/canvas/cronograma-sections/CronogramaSections.tsx
 *
 * Las dos secciones del documento CRONOGRAMA: la portada y el Gantt.
 *
 * ── SOLO LECTURA, Y NO ES UNA LIMITACIÓN ─────────────────────────────────────
 * Ninguna de las dos es editable, porque el editor del cronograma ya existe y es otro: el
 * Gantt de `CronogramaCanvas`, con su drag & drop, su assist y su barra de publicar. Este
 * documento es la SALIDA — lo que se entrega, en la misma vista que ya recibe el cliente en
 * `/external/cronograma`. Meterle edición sería un segundo editor del mismo dato.
 *
 * Ninguna se alimenta de un `CanvasBlock`: el Gantt sale de `ctx.cronograma.timeline` (fuente
 * única: `ProjectTimeline`) y la portada solo recibe el nombre del proyecto, que el cargador
 * sintetiza. Ver `components/landing/configs/cronograma.defs.ts`.
 */
import { type FC } from "react";
import { BrandRow, HeroStat } from "@/components/landing/hero-parts";
import { resolveHeroTitle } from "@/lib/landing/hero-title";
import type { SectionProps } from "@/components/landing/types";
import TimelineSection from "@/components/canvas/TimelineSection";
import { timelineSpan, fmtFull } from "@/lib/timeline/weeks";

interface PortadaData {
  /** Lo único que aporta el cargador: desambigua a un cliente con varios proyectos. */
  subhead?: string;
}

// ── Portada ───────────────────────────────────────────────────────────────────
export const CronogramaHeroSection: FC<SectionProps<PortadaData>> = ({
  data, ctx, sectionTitle, sectionEyebrow,
}) => {
  const d = (data ?? {}) as PortadaData;
  const phases = ctx.cronograma?.timeline?.phases ?? [];
  const totalWeeks = timelineSpan(phases);
  const anchor = ctx.cronograma?.timeline?.anchorStartDate;
  const startLabel = anchor ? fmtFull(anchor) : "Por definir";

  // El título sale del RÓTULO declarado en la definición, no de un texto escrito acá: nadie
  // escribe esta portada, así que no hay `titulo` ni `headline` que puedan pisarlo.
  const { titulo } = resolveHeroTitle({ escrito: "", titular: "", rotulo: sectionTitle });

  return (
    <div className="stl-hero-centered" style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
      {/* Marca + logo del cliente con su escala — la misma fila que abre los otros ocho
          documentos. `brands: []` siembra los defaults (cliente × Smarteam × HubSpot). */}
      <BrandRow brands={[]} ctx={ctx} editable={false} onChange={() => {}} />
      {sectionEyebrow && <span className="eyebrow">{sectionEyebrow}</span>}
      <h1 className="stl-hero-title">{titulo}</h1>
      {d.subhead && (
        <div style={{ maxWidth: 640, marginInline: "auto" }}>
          <p className="stl-lead">{d.subhead}</p>
        </div>
      )}
      {/* Los mismos tres números que abren el kickoff, derivados del cronograma. */}
      {phases.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 32, justifyContent: "center", marginTop: 38 }}>
          <HeroStat value={String(totalWeeks)} unit="semanas" label="Duración total" />
          <HeroStat value={startLabel} label="Arranque" />
          <HeroStat value={String(phases.length)} unit={phases.length === 1 ? "fase" : "fases"} label="Hoja de ruta" />
        </div>
      )}
    </div>
  );
};

// ── El Gantt (ctxDriven: rinde su propia sección o null) ───────────────────────
export const CronogramaTimelineSection: FC<SectionProps<unknown>> = ({ ctx }) => {
  const t = ctx.cronograma?.timeline;
  if (!t?.exists || (t.phases?.length ?? 0) === 0) return null;
  /* Scope MÍNIMO del CSS legacy: `TimelineSection` usa las clases base de
     app/kickoff-landing.css (section-light, eyebrow, font-display, reveal) y NO vive bajo
     `.stl`. Mismo wrapper que usa `KickoffTimelineSection`, por el mismo motivo. */
  return (
    <div className="kickoff-landing">
      <TimelineSection
        phases={t.phases}
        anchor={t.anchorStartDate ?? null}
        /* La portada ya titula el documento: el Gantt no repite su encabezado. Es la misma
           combinación que usa la página del cliente (components/external/TimelineLanding). */
        showHeader={false}
        showProgress
        particularidades={t.particularidades}
        pdf={ctx.pdfMode}
      />
    </div>
  );
};
