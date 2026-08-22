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
import { useEjecutarOperacionesDelChat } from "@/components/asistente/ejecutar-operaciones";
/* ⚠ La MISMA tabla que usa el servidor para correr el ejecutor en seco antes de acordar. Con
   dos literales, el chat podía acordar algo que este editor rechaza al aplicar. */
import { CAPACIDADES_POR_PIEZA } from "@/lib/canvas/capacidades-de-documento";
import { DESARROLLO_DEF_BY_KEY } from "@/components/landing/configs/desarrollo.defs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import LandingView, { type LandingSectionData } from "@/components/landing/LandingView";
import type { LandingContext } from "@/components/landing/types";
import CanvasAgentButton from "@/components/clients/CanvasAgentButton";
import DocumentAssist from "@/components/ai/DocumentAssist";
import SugerirParticularidad from "@/components/canvas/SugerirParticularidad";
import { useMe } from "@/hooks/useMe";
import { useCanvasSections } from "./useCanvasSections";
import { buildDesarrolloConfig, buildDesarrolloSections } from "./desarrollo-landing-adapter";
import type { DevEstimateCtx } from "@/components/landing/types";

const MAXW = 860;

export default function DesarrolloWorkspace({
  projectId,
  clientId,
  canvasId,
  headerSlot,
}: {
  projectId: string;
  clientId: string;
  canvasId: string;
  /** Nodo del header del panel donde este canvas inyecta sus CTAs (junto al nombre). */
  headerSlot?: HTMLElement | null;
}) {
  // poll:false — el poll genérico de este hook solo refetchea cuando cambia la cuenta de
  // bloques DRAFT, pero runDesarrolloGeneration siempre persiste CONFIRMED: nunca dispararía
  // acá y quedaría corriendo indefinidamente sin motivo. El poll acotado propio de abajo
  // (awaitingGen) ya cubre la ventana de "generación en curso".
  const cs = useCanvasSections(`/api/projects/${projectId}`, canvasId, undefined, { poll: false });

  /* El chat de este documento ejecuta acá: el editor es el único que escribe, con su optimismo y
     su deshacer. Ocultar y crear están cableados en los seis desde el 2026-08-21. */
  useEjecutarOperacionesDelChat(cs, DESARROLLO_DEF_BY_KEY, CAPACIDADES_POR_PIEZA["tech-requirements"]);
  const [nonce, setNonce] = useState(0); // fuerza refetch tras regenerar

  /* El estado de "compartir con el dev" ya no vive acá: se lee y se escribe desde el panel
     de "Acceso activo" (`components/clients/ExternalAccessPanel.tsx`), junto al kickoff y al
     cronograma. El endpoint `publish-desarrollo` es el mismo; lo que cambió es quién lo llama. */

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
      hidden: s.hidden === true,
    }));
  }, [cs.sections]);

  // ── Estimación de esfuerzo (sección `estimacion`, ctxDriven) ──────────────────
  // Vive en la tabla DevEstimate, no en un CanvasBlock: se carga aparte y viaja por ctx.
  const me = useMe();
  const [estimate, setEstimate] = useState<DevEstimateCtx | null>(null);
  const [estHistory, setEstHistory] = useState<DevEstimateCtx[]>([]);
  useEffect(() => {
    let vivo = true;
    void fetch(`/api/projects/${projectId}/dev-estimate`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo || !d) return;
        setEstimate(d.current ?? null);
        setEstHistory(d.history ?? []);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [projectId]);

  const onEstimate = useCallback(
    async (input: { hours: number | null; estimatedDate: string | null; note: string }) => {
      const res = await fetch(`/api/projects/${projectId}/dev-estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "No se pudo guardar la estimación.");
      }
      // El POST devuelve el estado completo → sin segundo GET (y sin ventana de desfase).
      const d = await res.json();
      setEstimate(d.current ?? null);
      setEstHistory(d.history ?? []);
    },
    [projectId],
  );

  const ctx: LandingContext = useMemo(
    () => ({
      clientName: "",
      desarrollo: {
        estimate,
        history: estHistory,
        // Gate COSMÉTICO (la barrera real es guardPermission en el POST). `=== true` para que
        // mientras `me` carga (null) el formulario NO parpadee visible y después desaparezca.
        canEstimate: me?.permissions?.sections?.desarrollo?.estimate === true,
        onEstimate,
      },
    }),
    [estimate, estHistory, me, onEstimate],
  );

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
      {/* Los CTAs van AL HEADER DEL PANEL, junto al nombre del canvas — el mismo lugar que
          el resto de las piezas. Antes vivían en una barra propia acá abajo, y Desarrollo
          era el único canvas del flujo con su botón en una segunda fila.
          Van por portal y no por `CANVAS_PRIMARY_AGENT` porque el botón necesita estado que
          solo este componente tiene: si la auto-generación posterior al handoff sigue en
          curso (`awaitingGen`), `busy` evita la doble corrida. Mismo mecanismo que usa el
          Cronograma para alternar entre "Generar" y "Chequear avance". */}
      {headerSlot && createPortal(
        <>
          {/* El canal del equipo técnico hacia el CSE: propone un hecho para el cronograma
              (atraso, aviso, compromiso) sin poder tocarlo. Se auto-oculta sin el permiso. */}
          <SugerirParticularidad projectId={projectId} />
          <CanvasAgentButton
            clientId={clientId}
            projectId={projectId}
            agentId="agent-desarrollo-canvas"
            label="Regenerar requerimiento"
            runningLabel="Generando requerimiento…"
            notifyLabel="requerimiento técnico"
            async
            onDone={onRegenDone}
            // `busy` muestra el botón como "Generando requerimiento…" (spinner) en vez de un
            // CTA muerto que ignora el click en silencio.
            busy={awaitingGen}
            // (C) el server exigirá regenerate si ya hay contenido, generate si no → gatear la UI
            // por esa misma celda para no mostrar un botón que daría 403.
            alreadyGenerated={hasGeneratedContent}
          />
        </>,
        headerSlot,
      )}
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
      {/* Acá vivía "Compartir con dev" con su propia barra de link y su botón de copiar.
          Se mudó a "Acceso activo", junto al kickoff y el cronograma.
          El motivo es que nunca fueron cosas distintas: es el MISMO token del proyecto y la
          MISMA contraseña —tanto, que esta barra tenía que aclarar "la contraseña es la misma
          del Acceso del cliente"—; lo único que cambia es a dónde aterriza quien entra. Tener
          dos lugares para compartir obligaba a saber que el requerimiento se comparte por un
          lado y todo lo demás por otro, y dejaba el estado de una superficie invisible desde
          el panel que dice quién tiene acceso al proyecto. */}
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
        /* El ojo: apaga la sección para quien lee el documento, sin borrar nada. Se guarda en el
           Json del canvas (`patchSectionEntry`) y NO en una columna — regla dual-PC. */
        onToggleHidden={(key, hidden) => {
          const id = idByKey.get(key);
          if (id) void cs.setHidden(id, hidden);
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
