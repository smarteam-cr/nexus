"use client";

/**
 * components/canvas/desarrollo-sections/DesarrolloSections.tsx
 *
 * Componentes propios del canvas "Desarrollo" (requerimiento técnico) sobre el motor
 * `LandingView`. Casi todo el canvas REUSA los renderers genéricos del kickoff
 * (`KickoffProseSection` para las 5 secciones de contenido, `KickoffCtaSection` para
 * el cierre) — ver `configs/desarrollo.ts`. Lo único propio es el HERO, porque el del
 * kickoff trae logo de cliente + portada + stats del cronograma (irrelevantes acá) y
 * placeholders de "arranque de proyecto". Este hero es sobrio: título técnico + una
 * bajada de qué conecta con qué + chips de los sistemas involucrados.
 *
 * Registro (como el kickoff): render bajo `.kickoff-landing > .stl` para resolver las
 * clases `.stl-*` del motor. Reusa `normalizeHero` (mismo shape headline/subhead/tags).
 */
import { type FC } from "react";
import { Editable } from "@/components/landing/inline";
import { TagRow } from "@/components/landing/hero-parts";
import type { SectionProps } from "@/components/landing/types";
import { normalizeHero, type KickoffHeroData } from "@/components/canvas/kickoff-sections/types";

// ── Hero (requerimiento) ────────────────────────────────────────────────────────
// Mismo shape de data que el hero del kickoff (headline/subhead/tags) para reusar su
// normalizador y su persistencia, pero SIN brands/cover/stats: es un documento técnico
// interno, no una portada de cara al cliente.
export const DesarrolloHeroSection: FC<SectionProps<KickoffHeroData>> = ({ data, editable, onChange }) => {
  const d = normalizeHero(data);
  const set = (next: Partial<KickoffHeroData>) => {
    // Al guardar migramos `intro` legacy → `subhead` y no re-escribimos claves muertas.
    const { __legacyMd: _md, intro: _intro, brands: _brands, coverImageUrl: _cover, ...clean } = d;
    void _md; void _intro; void _brands; void _cover;
    onChange?.({ ...clean, ...next });
  };
  const eyebrow = d.eyebrow?.trim() || "Requerimiento técnico";
  const headline = d.headline?.trim() || "Requerimiento técnico de integración";

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
      {editable ? (
        <Editable as="span" className="eyebrow" editable value={d.eyebrow ?? ""} placeholder="Requerimiento técnico" onCommit={(v) => set({ eyebrow: v })} />
      ) : (
        <span className="eyebrow">{eyebrow}</span>
      )}
      {editable ? (
        <Editable
          as="h1"
          className="stl-hero-title"
          editable
          value={d.headline}
          placeholder="Requerimiento técnico: integración HubSpot ↔ [sistema]"
          onCommit={(v) => set({ headline: v })}
        />
      ) : (
        <h1 className="stl-hero-title">{headline}</h1>
      )}
      {(editable || d.subhead) && (
        <div style={{ maxWidth: 660, marginInline: "auto" }}>
          <Editable
            as="p"
            className="stl-lead"
            editable={editable}
            value={d.subhead}
            placeholder="Una frase: qué sistemas conecta y para qué (ej. HubSpot ↔ ERP para sincronizar negocios cerrados)…"
            onCommit={(v) => set({ subhead: v })}
          />
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <TagRow tags={d.tags} editable={editable} onChange={(next) => set({ tags: next })} placeholder="Sistema / API / tipo…" />
      </div>
    </div>
  );
};
