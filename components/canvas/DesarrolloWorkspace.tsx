"use client";

/**
 * components/canvas/DesarrolloWorkspace.tsx
 *
 * Editor interno del canvas "Desarrollo" (requerimiento técnico) sobre el motor
 * `LandingView`. Mucho más simple que el KickoffWorkspace: sin staging/publish (un
 * requerimiento técnico no gatea qué ve un cliente; la vista externa lee el canvas
 * vivo), sin secciones ctxDriven (no hay cronograma/procesos). Reusa el hook genérico
 * `useCanvasSections` + el adaptador `desarrollo-landing-adapter`.
 *
 * Regenerar todo el requerimiento con IA: botón `CanvasAgentButton` (agent-desarrollo-
 * canvas) en la barra superior → corre el runner y remonta al terminar. La edición
 * inline (por campos) y el reorden se guardan al instante vía useCanvasSections.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import LandingView, { type LandingSectionData } from "@/components/landing/LandingView";
import type { LandingContext } from "@/components/landing/types";
import CanvasAgentButton from "@/components/clients/CanvasAgentButton";
import DocumentAssist from "@/components/ai/DocumentAssist";
import { useCanvasSections } from "./useCanvasSections";
import { buildDesarrolloConfig, buildDesarrolloSections } from "./desarrollo-landing-adapter";

const MAXW = 860;

export default function DesarrolloWorkspace({
  projectId,
  clientId,
  canvasId,
}: {
  projectId: string;
  clientId: string;
  canvasId: string;
}) {
  // poll:false — el poll genérico de este hook solo refetchea cuando cambia la cuenta de
  // bloques DRAFT, pero runDesarrolloGeneration siempre persiste CONFIRMED: nunca dispararía
  // acá y quedaría corriendo indefinidamente sin motivo. El poll acotado propio de abajo
  // (awaitingGen) ya cubre la ventana de "generación en curso".
  const cs = useCanvasSections(`/api/projects/${projectId}`, canvasId, undefined, { poll: false });
  const [nonce, setNonce] = useState(0); // fuerza refetch tras regenerar

  // Compartir con un DEV externo (desarrolloPublishedAt). Sin esto, la página
  // /external/desarrollo no muestra nada (gate de seguridad). No es "publicar al
  // cliente" — es habilitar el link técnico para el desarrollador.
  const [shared, setShared] = useState<boolean | null>(null);
  const [sharing, setSharing] = useState(false);
  const [devUrl, setDevUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const refreshShareStatus = useCallback(() => {
    return fetch(`/api/projects/${projectId}/publish-desarrollo`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setShared(!!d?.published);
        setDevUrl(d?.devUrl ?? null);
      })
      .catch(() => setShared(null));
  }, [projectId]);
  useEffect(() => {
    void refreshShareStatus();
  }, [refreshShareStatus]);
  const toggleShared = useCallback(async () => {
    if (shared === null) return;
    setSharing(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/publish-desarrollo`, { method: shared ? "DELETE" : "POST" });
      // Refetch (no solo optimistic) — así `devUrl` se pone al día si el acceso externo
      // del proyecto se generó recién (antes estaba `null` y el compartir quedaba mudo).
      if (res.ok) await refreshShareStatus();
    } finally {
      setSharing(false);
    }
  }, [projectId, shared, refreshShareStatus]);
  const copyDevLink = useCallback(async () => {
    if (!devUrl) return;
    await navigator.clipboard.writeText(devUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [devUrl]);

  // ¿Ya hay contenido generado? El canvas puede aparecer (auto-creado por el handoff)
  // ANTES de que la generación fire-and-forget escriba las secciones. `ensureDesarrolloCanvas`
  // solo siembra el bloque del `cierre`, así que si alguna sección ≠ cierre tiene un CARD,
  // la generación ya corrió. Mientras no lo tenga, mostramos "Generando…" + poll acotado.
  const hasGeneratedContent = useMemo(
    () => cs.sections.some((s) => s.key !== "cierre" && s.blocks.some((b) => b.blockType === "CARD")),
    [cs.sections],
  );
  const [awaitingGen, setAwaitingGen] = useState(false);
  // Se prende SOLO si el poll se agotó sin ver contenido — la auto-generación (fire-and-
  // forget, sin AgentRun) puede haber fallado en silencio (rate limit, timeout, JSON
  // malformado); sin esto el banner "Generando…" simplemente desaparecía sin avisar nada.
  const [genTimedOut, setGenTimedOut] = useState(false);
  useEffect(() => {
    if (cs.loading) return;
    if (hasGeneratedContent) { setAwaitingGen(false); setGenTimedOut(false); return; }
    // Sin contenido: el auto-gen probablemente sigue corriendo. Poll acotado (~40 s) que
    // se corta solo al llegar contenido (hasGeneratedContent flip → cleanup) o al agotarse.
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
  const config = useMemo(() => buildDesarrolloConfig(cs.sections.map((s) => s.key)), [cs.sections]);
  const sections: LandingSectionData[] = useMemo(() => {
    const built = buildDesarrolloSections(cs.sections);
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
    // `.stl` da el lienzo blanco/tipografía del documento mientras carga (el
    // wrapper legacy `.kickoff-landing` ya no envuelve al motor — Ola 6).
    return (
      <div className="stl">
        <div style={{ maxWidth: MAXW, margin: "0 auto", padding: "48px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton-shimmer" style={{ height: 120, borderRadius: 16 }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div key={nonce}>
      {cs.error && (
        <div style={{ position: "sticky", top: 0, zIndex: 50, display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "#fef2f2", borderBottom: "1px solid #fecaca", color: "#b91c1c", fontSize: 13 }}>
          <span style={{ flex: 1 }}>{cs.error}</span>
          <button onClick={() => cs.clearError()} title="Cerrar" style={{ color: "#b91c1c", background: "transparent", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}
      <div style={{ position: "sticky", top: 0, zIndex: 40, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: "10px 16px", background: "var(--bg, #fff)", borderBottom: "1px solid var(--border, #e5e7eb)" }}>
        {shared !== null && (
          <button
            onClick={toggleShared}
            disabled={sharing}
            title={shared ? "El dev externo ve el requerimiento en /external/desarrollo. Clic para dejar de compartir." : "Habilita el link /external/desarrollo para el desarrollador externo."}
            style={{
              display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 8, cursor: sharing ? "wait" : "pointer",
              ...(shared
                ? { color: "#047857", background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.4)" }
                : { color: "var(--text-secondary, #6b7280)", background: "transparent", border: "1px solid var(--border, #e5e7eb)" }),
            }}
          >
            {shared ? "✓ Compartido con dev" : "Compartir con dev"}
          </button>
        )}
        <CanvasAgentButton
          clientId={clientId}
          projectId={projectId}
          agentId="agent-desarrollo-canvas"
          label="Regenerar requerimiento"
          runningLabel="Generando requerimiento…"
          notifyLabel="requerimiento técnico"
          async
          onDone={onRegenDone}
          // La auto-generación tras el handoff puede seguir en curso (awaitingGen): `busy` evita
          // la doble corrida Y muestra el botón como "Generando requerimiento…" (spinner) en vez
          // de un CTA muerto que ignora el click en silencio.
          busy={awaitingGen}
          // (C) el server exigirá regenerate si ya hay contenido, generate si no → gatear la UI
          // por esa misma celda para no mostrar un botón que daría 403.
          alreadyGenerated={hasGeneratedContent}
        />
      </div>
      {/* Assist de documento: instrucción → propuesta → revisar → aplicar por
          upsertCardData (a diferencia de Regenerar, que reescribe TODO). */}
      {hasGeneratedContent && (
        <DocumentAssist
          url={`/api/projects/${projectId}/canvas-assist`}
          extraBody={{ canvasId }}
          dialogTitle="Mejorar el requerimiento con IA"
          chips={["Hazlo más técnico y específico", "Aclara la arquitectura de la integración", "Resume las secciones largas"]}
          placeholder='Ej: "detalla mejor el mapeo de objetos entre sistemas"'
          labelFor={(key) => cs.sections.find((s) => s.key === key)?.label ?? key}
          onApplySection={(key, data) => {
            const s = cs.sections.find((x) => x.key === key);
            if (!s) return;
            const card = s.blocks.find((b) => b.blockType === "CARD");
            return cs.upsertCardData(s.id, card?.id ?? null, data);
          }}
          className="px-4 pt-3"
        />
      )}
      {awaitingGen && !hasGeneratedContent && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "rgba(11,88,211,0.06)", borderBottom: "1px solid rgba(11,88,211,0.2)", fontSize: 13, color: "#07429A" }}>
          <span className="skeleton-shimmer" style={{ width: 14, height: 14, borderRadius: "50%", flexShrink: 0 }} />
          <span>Generando el requerimiento técnico… (puede tomar ~20&nbsp;s). Se actualiza solo al terminar.</span>
        </div>
      )}
      {genTimedOut && !hasGeneratedContent && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "rgba(245,158,11,0.08)", borderBottom: "1px solid rgba(245,158,11,0.25)", fontSize: 13, color: "#92400E" }}>
          <span>No pudimos confirmar que la generación automática haya terminado. Probá <strong>Regenerar requerimiento</strong> arriba.</span>
        </div>
      )}
      {shared && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", background: "rgba(16,185,129,0.06)", borderBottom: "1px solid rgba(16,185,129,0.2)", fontSize: 12, color: "#065f46" }}>
          {devUrl ? (
            <>
              <span style={{ fontWeight: 600, flexShrink: 0 }}>Link para el dev:</span>
              <input
                readOnly
                value={devUrl}
                onFocus={(e) => e.currentTarget.select()}
                style={{ flex: 1, minWidth: 0, fontFamily: "ui-monospace, monospace", fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(16,185,129,0.3)", background: "#fff", color: "#374151" }}
              />
              <button onClick={copyDevLink} style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(16,185,129,0.3)", background: "#fff", color: "#065f46", cursor: "pointer" }}>
                {copied ? "✓ Copiado" : "Copiar"}
              </button>
              <span style={{ flexShrink: 0, color: "#047857" }}>La contraseña es la misma del Acceso del cliente.</span>
            </>
          ) : (
            <span>Compartido, pero falta generar el <strong>Acceso del cliente</strong> (token+contraseña) para tener el link de entrada del dev.</span>
          )}
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
          // keys = las de CONTENIDO en el orden nuevo (el motor excluye hero y cierre, pinneados).
          const heroId = idByKey.get("requerimiento");
          const contentIds = keys.map((kk) => idByKey.get(kk)).filter((x): x is string => !!x);
          const ordered = [heroId, ...contentIds].filter((x): x is string => !!x);
          if (ordered.length) cs.reorderSections(ordered);
        }}
      />
    </div>
  );
}
