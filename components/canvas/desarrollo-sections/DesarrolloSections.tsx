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
 * Registro (como el kickoff): render bajo `.stl` (landing-engine.css, que desde la
 * Ola 6 también resuelve el vocabulario ex kickoff — eyebrow, stl-hero-centered).
 * Reusa `normalizeHero` (mismo shape headline/subhead/tags).
 */
import { type FC } from "react";
import { Editable } from "@/components/landing/inline";
import { TagRow } from "@/components/landing/hero-parts";
import { resolveHeroTitle } from "@/lib/landing/hero-title";
import type { SectionProps } from "@/components/landing/types";
import { normalizeHero, type KickoffHeroData } from "@/components/canvas/kickoff-sections/types";

// ── Hero (requerimiento) ────────────────────────────────────────────────────────
// Mismo shape de data que el hero del kickoff (headline/subhead/tags) para reusar su
// normalizador y su persistencia, pero SIN brands/cover/stats: es un documento técnico
// interno, no una portada de cara al cliente.
export const DesarrolloHeroSection: FC<SectionProps<KickoffHeroData>> = ({
  data, editable, onChange, sectionTitle, sectionEyebrow,
}) => {
  const d = normalizeHero(data);
  const set = (next: Partial<KickoffHeroData>) => {
    // Al guardar migramos `intro` legacy → `subhead` y no re-escribimos claves muertas.
    const { __legacyMd: _md, intro: _intro, brands: _brands, coverImageUrl: _cover, ...clean } = d;
    void _md; void _intro; void _brands; void _cover;
    onChange?.({ ...clean, ...next });
  };
  /* ⚠ ACÁ ESTABA EL DEFECTO: esta portada la comparten Desarrollo, Exploración,
     Planificación e Implementación, y su respaldo estaba escrito a mano —
     "Requerimiento técnico de integración"—, así que una Planificación sin generar se
     presentaba como un requerimiento técnico. Ahora el respaldo entra por props: es el
     rótulo del documento que se está pintando, sea cual sea. */
  const eyebrow = d.eyebrow?.trim() || (sectionEyebrow ?? "").trim();
  // El titular del caso es título O bajada, nunca los dos: mientras el documento no
  // tenga título propio, su titular sigue arriba y los ya generados no cambian solos.
  const { titulo, bajada } = resolveHeroTitle({
    escrito: d.titulo, titular: d.headline, rotulo: sectionTitle,
  });

  return (
    <div className="stl-hero-centered" style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
      {editable ? (
        <Editable as="span" className="eyebrow" editable value={d.eyebrow ?? ""} placeholder={sectionEyebrow ?? ""} onCommit={(v) => set({ eyebrow: v })} />
      ) : (
        eyebrow && <span className="eyebrow">{eyebrow}</span>
      )}
      {editable ? (
        <Editable
          as="h1"
          className="stl-hero-title"
          editable
          value={titulo}
          placeholder={sectionTitle ?? ""}
          onCommit={(v) => set({ titulo: v })}
        />
      ) : (
        <h1 className="stl-hero-title">{titulo}</h1>
      )}
      {/* El titular del caso, cuando NO subió a título. */}
      {(editable || bajada) && (
        <div style={{ maxWidth: 660, marginInline: "auto" }}>
          <Editable
            as="p"
            className="stl-lead"
            editable={editable}
            value={bajada}
            placeholder="El titular del caso en una frase…"
            onCommit={(v) => set({ titulo, headline: v })}
          />
        </div>
      )}
      {(editable || d.subhead) && (
        <div style={{ maxWidth: 660, marginInline: "auto" }}>
          <Editable
            as="p"
            className="stl-lead"
            editable={editable}
            value={d.subhead}
            placeholder="El resumen en una o dos frases…"
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
