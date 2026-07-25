"use client";

/**
 * components/canvas/PlanificacionWorkspace.tsx
 *
 * Editor del canvas "Planificación" (el plan que el cliente aprueba antes de habilitar
 * el CRM) sobre el motor `LandingView`. Su agente se dispara desde el HEADER del canvas
 * (`CANVAS_PRIMARY_AGENT`, asíncrono: la corrida se ve en el centro de corridas).
 *
 * Documento de TRABAJO interno (paleta `stl-internal`): se presenta y discute con el
 * cliente en sesión, pero no tiene superficie externa propia.
 */
import { useMemo } from "react";
import LandingView, { type LandingSectionData } from "@/components/landing/LandingView";
import type { LandingContext } from "@/components/landing/types";
import { useCanvasSections } from "./useCanvasSections";
import { buildPlanificacionConfig, buildPlanificacionSections } from "./planificacion-landing-adapter";

const MAXW = 860;

export default function PlanificacionWorkspace({
  projectId,
  canvasId,
}: {
  projectId: string;
  canvasId: string;
}) {
  // poll:false — el runner persiste CONFIRMED; tras generar, el remonte lo fuerza el
  // padre (`key` con su `agentNonce` al terminar el agente del header).
  const cs = useCanvasSections(`/api/projects/${projectId}`, canvasId, undefined, { poll: false });

  // ¿Ya corrió la generación? El seed solo siembra el bloque del `cierre` (curado).
  const hasGeneratedContent = useMemo(
    () => cs.sections.some((s) => s.key !== "cierre" && s.blocks.length > 0),
    [cs.sections],
  );

  const idByKey = useMemo(() => new Map(cs.sections.map((s) => [s.key, s.id])), [cs.sections]);
  const config = useMemo(() => buildPlanificacionConfig(cs.sections.map((s) => s.key)), [cs.sections]);
  const sections: LandingSectionData[] = useMemo(() => {
    const built = buildPlanificacionSections(cs.sections);
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
          {/* Cáscara DELINEADA, no un slab macizo (DECISIONS §Estados de carga). */}
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                minHeight: 120,
                borderRadius: 16,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                padding: 20,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
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

      {/* Estado IDLE: abrir la pieza recién activada sin generar es lo normal. */}
      {!hasGeneratedContent && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "var(--bg-soft)", borderBottom: "1px solid var(--border)", fontSize: 13, color: "var(--text-2)" }}>
          <span>
            Todavía sin generar. Usá <strong>Generar planificación</strong> arriba, junto al nombre
            del canvas — la corrida aparece en el centro de corridas y podés seguir navegando.
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
          // Legacy con bloques TEXT y sin CARD: read-only (manda el fallback markdown).
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
          const heroId = idByKey.get("planificacion");
          const contentIds = keys.map((kk) => idByKey.get(kk)).filter((x): x is string => !!x);
          const ordered = [heroId, ...contentIds].filter((x): x is string => !!x);
          if (ordered.length) cs.reorderSections(ordered);
        }}
      />
    </div>
  );
}
