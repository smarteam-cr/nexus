"use client";

/**
 * components/canvas/ExploracionWorkspace.tsx
 *
 * Editor del canvas "Exploración" (guía de descubrimiento del negocio) sobre el motor
 * `LandingView`. Es un canvas de PRIMERA CLASE (modelo Kickoff): se pre-crea con el
 * proyecto, vive en el dropdown, y su agente se dispara desde el HEADER del canvas
 * (`CANVAS_PRIMARY_AGENT`), no desde acá — igual que el kickoff en su canvas.
 *
 * Es el hermano INTERNO de `DesarrolloWorkspace`, con dos diferencias deliberadas:
 *
 *  1. NO tiene compartir/publicar. El de Desarrollo trae "Compartir con dev" +
 *     `publish-desarrollo` + el link de `/external/desarrollo`; acá no existe ese bloque
 *     porque no existe la superficie externa. No está apagado: no está. El test
 *     `lib/canvas/exploracion-internal.test.ts` congela esa ausencia para que no vuelva
 *     por copiar-pegar del gemelo.
 *  2. Se renderiza con la PALETA INTERNA (`stl stl-internal`): grises y blancos, con un
 *     ámbar reservado a lo no verificado. El CSE distingue a simple vista que esto no es
 *     lo que ve el cliente.
 *
 * Todo lo demás lo hereda del motor vía `useCanvasSections`: edición inline con commit en
 * blur y en desmontaje, drag & drop de ítems, reorden de secciones, undo global.
 */
import { useMemo } from "react";
import LandingView, { type LandingSectionData } from "@/components/landing/LandingView";
import type { LandingContext } from "@/components/landing/types";
import { useCanvasSections } from "./useCanvasSections";
import { buildExploracionConfig, buildExploracionSections } from "./exploracion-landing-adapter";

const MAXW = 860;

export default function ExploracionWorkspace({
  projectId,
  canvasId,
}: {
  projectId: string;
  canvasId: string;
}) {
  // poll:false — igual que Desarrollo: el poll genérico solo refetchea al cambiar la
  // cuenta de bloques DRAFT, y el runner persiste CONFIRMED. Tras generar, el remonte
  // lo fuerza el padre (`key` con su `agentNonce` al terminar el agente del header).
  const cs = useCanvasSections(`/api/projects/${projectId}`, canvasId, undefined, { poll: false });

  // ¿Ya hay contenido generado? La creación del canvas solo siembra el bloque del
  // `cierre` (curado), así que si alguna sección ≠ cierre tiene un CARD, la generación
  // ya corrió. Se usa para el aviso de "todavía sin generar" — NO para inferir que hay
  // una corrida en curso: como canvas default, lo normal es abrirlo en frío sin generar.
  const hasGeneratedContent = useMemo(
    () => cs.sections.some((s) => s.key !== "cierre" && s.blocks.some((b) => b.blockType === "CARD")),
    [cs.sections],
  );

  const idByKey = useMemo(() => new Map(cs.sections.map((s) => [s.key, s.id])), [cs.sections]);
  const config = useMemo(() => buildExploracionConfig(cs.sections.map((s) => s.key)), [cs.sections]);
  const sections: LandingSectionData[] = useMemo(() => {
    const built = buildExploracionSections(cs.sections);
    return cs.sections.map((s, i) => ({
      key: s.key,
      data: built[i].data,
      titleOverride: s.titleOverride,
      eyebrowOverride: s.eyebrowOverride,
    }));
  }, [cs.sections]);

  const ctx: LandingContext = useMemo(() => ({ clientName: "" }), []);

  if (cs.loading) {
    // `.stl stl-internal` da el lienzo y la tipografía del documento ya con la paleta
    // interna, para que el skeleton no parpadee del tema de marca al gris.
    return (
      <div className="stl stl-internal">
        <div style={{ maxWidth: MAXW, margin: "0 auto", padding: "48px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Cáscara DELINEADA, no un slab macizo (DECISIONS §Estados de carga): reserva
              la altura de una tarjeta de sección y se parece a lo que va a aparecer. */}
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

      {/* El rótulo es parte del contrato con el CSE: este documento no se comparte.
          El CTA de generar NO vive acá: está en el header del canvas, junto a su nombre
          (CANVAS_PRIMARY_AGENT), igual que el del kickoff en el canvas de kickoff. */}
      <div style={{ position: "sticky", top: 0, zIndex: 40, display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
          Documento interno · no se comparte con el cliente
        </span>
      </div>

      {/* Estado IDLE (el canvas existe desde que nace el proyecto, así que abrirlo sin
          generar es lo NORMAL — no se asume que hay una corrida en curso). */}
      {!hasGeneratedContent && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "var(--bg-soft)", borderBottom: "1px solid var(--border)", fontSize: 13, color: "var(--text-2)" }}>
          <span>
            Todavía sin generar. Usá <strong>Generar exploración</strong> arriba, junto al nombre
            del canvas. El handoff del proyecto es la fuente ancla.
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
          // keys = las de CONTENIDO en el orden nuevo (el motor excluye hero y cierre).
          const heroId = idByKey.get("exploracion");
          const contentIds = keys.map((kk) => idByKey.get(kk)).filter((x): x is string => !!x);
          const ordered = [heroId, ...contentIds].filter((x): x is string => !!x);
          if (ordered.length) cs.reorderSections(ordered);
        }}
      />
    </div>
  );
}
