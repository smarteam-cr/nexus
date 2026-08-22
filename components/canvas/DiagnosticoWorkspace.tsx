"use client";

/**
 * components/canvas/DiagnosticoWorkspace.tsx
 *
 * Editor del canvas "Diagnóstico" (informe de rendimiento para el cliente) sobre el
 * motor `LandingView`. Su agente se dispara desde el HEADER del canvas
 * (`CANVAS_PRIMARY_AGENT`, asíncrono: la corrida se ve en el centro de corridas),
 * igual que Exploración.
 *
 * A diferencia de ExploracionWorkspace, este documento es DE CARA AL CLIENTE: se
 * renderiza con la paleta de MARCA (`stl`, no `stl-internal`) — lo que el CSE ve es lo
 * que el cliente va a ver en la sesión o en el PDF. La publicación con link propio llega
 * en su propia tanda; hasta entonces la vía de entrega es la sesión en vivo y el export.
 */
import { useEjecutarOperacionesDelChat } from "@/components/asistente/ejecutar-operaciones";
import { DIAGNOSTICO_DEF_BY_KEY } from "@/components/landing/configs/diagnostico.defs";
import { useMemo, useState } from "react";
import LandingView, { type LandingSectionData } from "@/components/landing/LandingView";
import type { LandingContext } from "@/components/landing/types";
import { useCanvasSections } from "./useCanvasSections";
import { buildDiagnosticoConfig, buildDiagnosticoSections } from "./diagnostico-landing-adapter";
import DocumentAssist from "@/components/ai/DocumentAssist";

const MAXW = 860;

/** Slug de la pieza — `POST /pieces/[slug]` materializa sus secciones canónicas. */
const PIECE_SLUG = "diagnosis";

/** Sección resuelta contra la base: dónde escribir y si ya tiene un CARD que pisar. */
interface TargetSection {
  id: string;
  cardBlockId: string | null;
  hasBlocks: boolean;
}

const SIN_SECCION =
  "No se pudo guardar ese cambio: esta sección todavía no existe en este documento y no se pudo crear. " +
  "Copiá el texto, recargá la página y volvé a intentarlo.";

export default function DiagnosticoWorkspace({
  projectId,
  canvasId,
}: {
  projectId: string;
  canvasId: string;
}) {
  // poll:false — el runner persiste CONFIRMED; tras generar, el remonte lo fuerza el
  // padre (`key` con su `agentNonce` al terminar el agente del header).
  const cs = useCanvasSections(`/api/projects/${projectId}`, canvasId, undefined, { poll: false });

  /* El chat de este documento ejecuta acá: el editor es el único que escribe, con su optimismo y
     su deshacer. Ocultar y crear están cableados en los seis desde el 2026-08-21. */
  useEjecutarOperacionesDelChat(cs, DIAGNOSTICO_DEF_BY_KEY, { puedeOcultar: true, puedeCrear: true });

  // ¿Ya corrió la generación? El seed solo siembra el bloque del `cierre` (curado).
  const hasGeneratedContent = useMemo(
    () => cs.sections.some((s) => s.key !== "cierre" && s.blocks.length > 0),
    [cs.sections],
  );

  const idByKey = useMemo(() => new Map(cs.sections.map((s) => [s.key, s.id])), [cs.sections]);
  const config = useMemo(() => buildDiagnosticoConfig(cs.sections.map((s) => s.key)), [cs.sections]);
  const sections: LandingSectionData[] = useMemo(() => {
    const built = buildDiagnosticoSections(cs.sections);
    return cs.sections.map((s, i) => ({
      key: s.key,
      data: built[i].data,
      titleOverride: s.titleOverride,
      eyebrowOverride: s.eyebrowOverride,
      hidden: s.hidden === true,
    }));
  }, [cs.sections]);

  const ctx: LandingContext = useMemo(() => ({ clientName: "" }), []);

  // Aviso propio del workspace (separado de `cs.error`, que es del hook): lo usamos cuando
  // ni siquiera pudimos llegar a guardar porque la sección no existe.
  const [aviso, setAviso] = useState<string | null>(null);

  /**
   * Resuelve una `key` de la plantilla a su fila REAL en la base, MATERIALIZÁNDOLA si el
   * documento es viejo y todavía no la tiene.
   *
   * POR QUÉ existe: los diagnósticos escritos con el formato anterior no traen las secciones
   * que la plantilla actual sumó (el hero `diagnostico`, `escala`, `cierre`), pero el motor
   * igual las pinta editables. Antes, editarlas terminaba en un `return` mudo — el CSE
   * escribía el titular, recargaba y el texto ya no estaba. Perder texto tipeado es el peor
   * resultado posible, así que primero intentamos CONSERVARLO: `POST /pieces/[slug]` es
   * idempotente y no destructivo (crea las secciones faltantes, nunca borra bloques), y
   * recién con la sección creada guardamos. Si aun así no se puede, el caller AVISA.
   */
  const resolveSection = async (key: string): Promise<TargetSection | null> => {
    const local = cs.sections.find((x) => x.key === key);
    if (local) {
      const card = local.blocks.find((b) => b.blockType === "CARD");
      return { id: local.id, cardBlockId: card?.id ?? null, hasBlocks: local.blocks.length > 0 };
    }
    try {
      const ensured = await fetch(`/api/projects/${projectId}/pieces/${PIECE_SLUG}`, { method: "POST" });
      const info = ensured.ok
        ? ((await ensured.json().catch(() => null)) as { canvasId?: string } | null)
        : null;
      // Si el proyecto tuviera OTRO canvas de esta pieza, el reconcile fue sobre ESE:
      // escribir igual mandaría el texto a un documento que el CSE no tiene abierto.
      if (!info || info.canvasId !== canvasId) return null;
      const listed = await fetch(`/api/projects/${projectId}/canvas-sections?canvasId=${canvasId}`);
      if (!listed.ok) return null;
      const payload = (await listed.json().catch(() => null)) as {
        sections?: Array<{ id: string; key: string; blocks?: Array<{ id: string; blockType: string }> }>;
      } | null;
      const row = payload?.sections?.find((s) => s.key === key);
      if (!row) return null;
      const card = row.blocks?.find((b) => b.blockType === "CARD");
      return { id: row.id, cardBlockId: card?.id ?? null, hasBlocks: (row.blocks?.length ?? 0) > 0 };
    } catch {
      return null;
    }
  };

  if (cs.loading) {
    return (
      <div className="stl">
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
    <div className="stl">
      {cs.error && (
        <div style={{ position: "sticky", top: 0, zIndex: 50, display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "#fef2f2", borderBottom: "1px solid #fecaca", color: "#b91c1c", fontSize: 13 }}>
          <span style={{ flex: 1 }}>{cs.error}</span>
          <button onClick={() => cs.clearError()} title="Cerrar" style={{ color: "#b91c1c", background: "transparent", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}

      {aviso && (
        <div style={{ position: "sticky", top: 0, zIndex: 50, display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "var(--bg-soft)", borderBottom: "1px solid var(--border-strong)", color: "var(--text-2)", fontSize: 13 }}>
          <span style={{ flex: 1 }}>{aviso}</span>
          <button onClick={() => setAviso(null)} title="Cerrar" style={{ color: "var(--text-2)", background: "transparent", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Estado IDLE: abrir la pieza recién activada sin generar es lo normal. */}
      {!hasGeneratedContent && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "var(--bg-soft)", borderBottom: "1px solid var(--border)", fontSize: 13, color: "var(--text-2)" }}>
          <span>
            Todavía sin generar. Usá <strong>Generar diagnóstico</strong> arriba, junto al nombre
            del canvas — la corrida aparece en el centro de corridas y podés seguir navegando.
          </span>
        </div>
      )}

      {/* Assist de documento: instrucción → propuesta → revisar → aplicar por
          upsertCardData (a diferencia de Regenerar, que reescribe TODO). */}
      {hasGeneratedContent && (
        <DocumentAssist
          url={`/api/projects/${projectId}/canvas-assist`}
          extraBody={{ canvasId }}
          dialogTitle="Mejorar el diagnóstico con IA"
          chips={["Hazlo más directo y menos técnico", "Ancla los hallazgos a los procesos mapeados", "Resume las secciones largas"]}
          placeholder='Ej: "sé más concreto en la causa raíz de cada dolor"'
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
      <LandingView
        config={config}
        ctx={ctx}
        sections={sections}
        mode="edit"
        showBriefs={false}
        onSectionChange={(key, data) => {
          void (async () => {
            const target = await resolveSection(key);
            if (!target) return setAviso(SIN_SECCION);
            // Legacy con bloques TEXT y sin CARD: read-only (manda el fallback markdown).
            if (!target.cardBlockId && target.hasBlocks) return;
            await cs.upsertCardData(target.id, target.cardBlockId, data);
          })();
        }}
        onTitleChange={(key, title) => {
          void (async () => {
            const target = await resolveSection(key);
            if (!target) return setAviso(SIN_SECCION);
            await cs.renameSection(target.id, title);
          })();
        }}
        onEyebrowChange={(key, eyebrow) => {
          void (async () => {
            const target = await resolveSection(key);
            if (!target) return setAviso(SIN_SECCION);
            await cs.setEyebrow(target.id, eyebrow);
          })();
        }}
        /* El ojo: apaga la sección para quien lee el documento, sin borrar nada. Se guarda en el
           Json del canvas (`patchSectionEntry`) y NO en una columna — regla dual-PC. */
        onToggleHidden={(key, hidden) => {
          const id = idByKey.get(key);
          if (id) void cs.setHidden(id, hidden);
        }}
        onReorder={(keys) => {
          const heroId = idByKey.get("diagnostico");
          const contentIds = keys.map((kk) => idByKey.get(kk)).filter((x): x is string => !!x);
          const ordered = [heroId, ...contentIds].filter((x): x is string => !!x);
          if (ordered.length) cs.reorderSections(ordered);
        }}
      />
    </div>
  );
}
