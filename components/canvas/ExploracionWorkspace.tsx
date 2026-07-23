"use client";

/**
 * components/canvas/ExploracionWorkspace.tsx
 *
 * Editor del canvas "Exploración" (guía de descubrimiento del negocio) sobre el motor
 * `LandingView`. Es el hermano INTERNO de `DesarrolloWorkspace`, con dos diferencias
 * deliberadas:
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
import { useCallback, useEffect, useMemo, useState } from "react";
import LandingView, { type LandingSectionData } from "@/components/landing/LandingView";
import type { LandingContext } from "@/components/landing/types";
import CanvasAgentButton from "@/components/clients/CanvasAgentButton";
import { useCanvasSections } from "./useCanvasSections";
import { buildExploracionConfig, buildExploracionSections } from "./exploracion-landing-adapter";

const MAXW = 860;

export default function ExploracionWorkspace({
  projectId,
  clientId,
  canvasId,
}: {
  projectId: string;
  clientId: string;
  canvasId: string;
}) {
  // poll:false — igual que Desarrollo: el poll genérico solo refetchea al cambiar la
  // cuenta de bloques DRAFT, y el runner persiste CONFIRMED. El poll acotado de abajo
  // (awaitingGen) cubre la ventana de "generación en curso".
  const cs = useCanvasSections(`/api/projects/${projectId}`, canvasId, undefined, { poll: false });
  const [nonce, setNonce] = useState(0); // fuerza remonte tras regenerar

  // ¿Ya hay contenido generado? `ensureExploracionCanvas` solo siembra el bloque del
  // `cierre` (curado), así que si alguna sección ≠ cierre tiene un CARD, la generación
  // ya corrió.
  const hasGeneratedContent = useMemo(
    () => cs.sections.some((s) => s.key !== "cierre" && s.blocks.some((b) => b.blockType === "CARD")),
    [cs.sections],
  );
  const [awaitingGen, setAwaitingGen] = useState(false);
  const [genTimedOut, setGenTimedOut] = useState(false);
  useEffect(() => {
    if (cs.loading) return;
    if (hasGeneratedContent) { setAwaitingGen(false); setGenTimedOut(false); return; }
    let tries = 0;
    setAwaitingGen(true);
    const id = setInterval(() => {
      tries += 1;
      if (tries >= 10) { setAwaitingGen(false); setGenTimedOut(true); clearInterval(id); return; }
      void cs.refetch();
    }, 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cs.loading, hasGeneratedContent]);

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

  const onRegenDone = useCallback(() => {
    setNonce((n) => n + 1);
    void cs.refetch();
  }, [cs]);

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
    <div key={nonce} className="stl stl-internal">
      {cs.error && (
        <div style={{ position: "sticky", top: 0, zIndex: 50, display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "#fef2f2", borderBottom: "1px solid #fecaca", color: "#b91c1c", fontSize: 13 }}>
          <span style={{ flex: 1 }}>{cs.error}</span>
          <button onClick={() => cs.clearError()} title="Cerrar" style={{ color: "#b91c1c", background: "transparent", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}

      <div style={{ position: "sticky", top: 0, zIndex: 40, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 16px", background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
        {/* El rótulo es parte del contrato con el CSE: este documento no se comparte. */}
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
          Documento interno · no se comparte con el cliente
        </span>
        <CanvasAgentButton
          clientId={clientId}
          projectId={projectId}
          agentId="agent-exploracion-canvas"
          label="Regenerar exploración"
          runningLabel="Generando exploración…"
          notifyLabel="exploración del negocio"
          async
          onDone={onRegenDone}
          busy={awaitingGen}
          // El server exige `regenerate` si ya hay contenido y `generate` si no → la UI
          // se gatea por la MISMA celda para no ofrecer un botón que daría 403.
          alreadyGenerated={hasGeneratedContent}
        />
      </div>

      {awaitingGen && !hasGeneratedContent && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "var(--bg-soft)", borderBottom: "1px solid var(--border)", fontSize: 13, color: "var(--text-2)" }}>
          <span className="skeleton-shimmer" style={{ width: 14, height: 14, borderRadius: "50%", flexShrink: 0 }} />
          <span>Generando la exploración… (puede tomar ~20&nbsp;s). Se actualiza sola al terminar.</span>
        </div>
      )}
      {genTimedOut && !hasGeneratedContent && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "var(--flag-soft)", borderBottom: "1px solid var(--flag-line)", fontSize: 13, color: "var(--flag)" }}>
          <span>No pudimos confirmar que la generación haya terminado. Probá <strong>Regenerar exploración</strong> arriba.</span>
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
