"use client";

/**
 * components/canvas/ImplementacionWorkspace.tsx
 *
 * Editor del canvas "Implementación" (la guía de construcción del CSE) sobre el motor
 * `LandingView`. Documento INTERNO (paleta `stl-internal`). Su agente se dispara desde
 * el header del canvas (async: la corrida se ve en el centro de corridas).
 *
 * EL GATE DE BREEZE (pedido de negocio): al entrar, el workspace consulta si hay
 * conocimiento del alcance de Breeze PUBLICADO. Si no lo hay, lo dice arriba con link a
 * /knowledge — y NO bloquea nada: el agente genera igual, marcando cada prompt como
 * "sin verificar". Avisar, nunca bloquear.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import LandingView, { type LandingSectionData } from "@/components/landing/LandingView";
import type { LandingContext } from "@/components/landing/types";
import { useCanvasSections } from "./useCanvasSections";
import { buildImplementacionConfig, buildImplementacionSections } from "./implementacion-landing-adapter";

const MAXW = 860;

export default function ImplementacionWorkspace({
  projectId,
  canvasId,
}: {
  projectId: string;
  canvasId: string;
}) {
  const cs = useCanvasSections(`/api/projects/${projectId}`, canvasId, undefined, { poll: false });

  // ¿Hay alcance de Breeze publicado en la base de conocimiento? null = consultando.
  const [breezeReady, setBreezeReady] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/knowledge/breeze-readiness")
      .then((r) => r.json())
      .then((d) => setBreezeReady(!!d.ready))
      .catch(() => setBreezeReady(null)); // sin dato, sin banner: no alarmar por un error de red
  }, []);

  const hasGeneratedContent = useMemo(
    () => cs.sections.some((s) => s.key !== "cierre" && s.blocks.length > 0),
    [cs.sections],
  );

  const idByKey = useMemo(() => new Map(cs.sections.map((s) => [s.key, s.id])), [cs.sections]);
  const config = useMemo(() => buildImplementacionConfig(cs.sections.map((s) => s.key)), [cs.sections]);
  const sections: LandingSectionData[] = useMemo(() => {
    const built = buildImplementacionSections(cs.sections);
    return cs.sections.map((s, i) => ({
      key: s.key,
      data: built[i].data,
      titleOverride: s.titleOverride,
      eyebrowOverride: s.eyebrowOverride,
    }));
  }, [cs.sections]);

  const ctx: LandingContext = useMemo(() => ({ clientName: "" }), []);

  if (cs.loading) {
    return (
      <div className="stl stl-internal">
        <div style={{ maxWidth: MAXW, margin: "0 auto", padding: "48px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{ minHeight: 120, borderRadius: 16, border: "1px solid var(--border)", background: "var(--bg)", padding: 20, display: "flex", flexDirection: "column", gap: 10 }}
            >
              <div className="skeleton-shimmer" style={{ height: 12, width: "35%", borderRadius: 6 }} />
              <div className="skeleton-shimmer" style={{ height: 10, width: "85%", borderRadius: 6 }} />
              <div className="skeleton-shimmer" style={{ height: 10, width: "70%", borderRadius: 6 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="stl stl-internal">
      {cs.error && (
        <div style={{ position: "sticky", top: 0, zIndex: 50, display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "#fef2f2", borderBottom: "1px solid #fecaca", color: "#b91c1c", fontSize: 13 }}>
          <span style={{ flex: 1 }}>{cs.error}</span>
          <button onClick={() => cs.clearError()} title="Cerrar" style={{ color: "#b91c1c", background: "transparent", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}

      <div style={{ position: "sticky", top: 0, zIndex: 40, display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
          Documento interno · la guía de construcción del CSE
        </span>
      </div>

      {/* El gate de Breeze: avisa, no bloquea. El agente genera igual y marca. */}
      {breezeReady === false && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "rgba(245, 158, 11, 0.08)", borderBottom: "1px solid rgba(245, 158, 11, 0.3)", fontSize: 13, color: "#92400e" }}>
          <span style={{ flex: 1 }}>
            <strong>Sin conocimiento de Breeze cargado.</strong> Los prompts se generan igual,
            marcados «sin verificar». Cargá el alcance real (tipo <em>HubSpot Spec</em>, etiquetas
            Breeze) y publicalo para que salgan verificados.
          </span>
          <Link
            href="/knowledge"
            style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: "#92400e", textDecoration: "underline" }}
          >
            Ir a Conocimientos →
          </Link>
        </div>
      )}

      {!hasGeneratedContent && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "var(--bg-soft)", borderBottom: "1px solid var(--border)", fontSize: 13, color: "var(--text-2)" }}>
          <span>
            Todavía sin generar. Usá <strong>Generar implementación</strong> arriba, junto al
            nombre del canvas. La planificación aprobada es la fuente ancla.
          </span>
        </div>
      )}

      <LandingView
        config={config}
        ctx={ctx}
        sections={sections}
        mode="edit"
        showBriefs={false}
        onSectionChange={(key, data) => {
          const s = cs.sections.find((x) => x.key === key);
          if (!s) return;
          const cardBlock = s.blocks.find((b) => b.blockType === "CARD");
          if (!cardBlock && s.blocks.length > 0) return;
          void cs.upsertCardData(s.id, cardBlock?.id ?? null, data);
        }}
        onTitleChange={(key, title) => {
          const id = idByKey.get(key);
          if (id) cs.renameSection(id, title);
        }}
        onEyebrowChange={(key, eyebrow) => {
          const id = idByKey.get(key);
          if (id) cs.setEyebrow(id, eyebrow);
        }}
        onReorder={(keys) => {
          const heroId = idByKey.get("implementacion");
          const contentIds = keys.map((kk) => idByKey.get(kk)).filter((x): x is string => !!x);
          const ordered = [heroId, ...contentIds].filter((x): x is string => !!x);
          if (ordered.length) cs.reorderSections(ordered);
        }}
      />
    </div>
  );
}
