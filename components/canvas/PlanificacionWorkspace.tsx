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
import { useEjecutarOperacionesDelChat } from "@/components/asistente/ejecutar-operaciones";
import { rotuloVigente, PLANIFICACION_CANVAS } from "@/lib/canvas/canvas-defs";
/* ⚠ La MISMA tabla que usa el servidor para correr el ejecutor en seco antes de acordar. Con
   dos literales, el chat podía acordar algo que este editor rechaza al aplicar. */
import { CAPACIDADES_POR_PIEZA } from "@/lib/canvas/capacidades-de-documento";
import { PLANIFICACION_DEF_BY_KEY } from "@/components/landing/configs/planificacion.defs";
import { useEffect, useMemo, useRef, useState } from "react";
import LandingView, { type LandingSectionData } from "@/components/landing/LandingView";
import type { LandingContext } from "@/components/landing/types";
import { useCanvasSections } from "./useCanvasSections";
import { buildPlanificacionConfig, buildPlanificacionSections } from "./planificacion-landing-adapter";
import DocumentAssist from "@/components/ai/DocumentAssist";
import { conservarLoDeFuera, type FilaPropiedad } from "@/lib/planificacion/propiedades";

const MAXW = 860;

/** Slug de la pieza — `POST /pieces/[slug]` materializa sus secciones canónicas. */
const PIECE_SLUG = "planning";

/** Sección resuelta contra la base: dónde escribir y si ya tiene un CARD que pisar. */
interface TargetSection {
  id: string;
  cardBlockId: string | null;
  hasBlocks: boolean;
}

const SIN_SECCION =
  "No se pudo guardar ese cambio: esta sección todavía no existe en este documento y no se pudo crear. " +
  "Copiá el texto, recargá la página y volvé a intentarlo.";

export default function PlanificacionWorkspace({
  projectId,
  canvasId,
  etiquetas,
}: {
  projectId: string;
  canvasId: string;
  /** Las etiquetas del proyecto (lo vendido): la ficha del proyecto ofrece marcar esos hubs. */
  etiquetas?: string[];
}) {
  // poll:false — el runner persiste CONFIRMED; tras generar, el remonte lo fuerza el
  // padre (`key` con su `agentNonce` al terminar el agente del header).
  const crudo = useCanvasSections(`/api/projects/${projectId}`, canvasId, undefined, { poll: false });

  /* 2026-10-25 — Las propiedades llevan cosas que el esquema del agente no conoce (de quién es cada fila,
     sus columnas extra, si va en la ficha, el orden de los grupos). «Mejorar con IA» y el chat escriben
     con ese esquema y las perdían: una fila de una persona pasaba a ser de la IA y el próximo regenerar
     la borraba. Toda escritura de la sección pasa por `conservarLoDeFuera`, que las recupera de la
     versión anterior; para una edición a mano no cambia nada, porque ya las trae. */
  const cs = useMemo(
    () => ({
      ...crudo,
      upsertCardData: (sectionId: string, cardBlockId: string | null, data: unknown) => {
        const s = crudo.sections.find((x) => x.id === sectionId);
        if (s?.key !== "propiedades") return crudo.upsertCardData(sectionId, cardBlockId, data);
        const previo = s.blocks.find((b) => b.blockType === "CARD")?.data;
        return crudo.upsertCardData(sectionId, cardBlockId, conservarLoDeFuera(previo, data));
      },
    }),
    [crudo],
  );

  /* El chat de este documento ejecuta acá: el editor es el único que escribe, con su optimismo y
     su deshacer. Ocultar y crear están cableados en los seis desde el 2026-08-21. */
  useEjecutarOperacionesDelChat(cs, PLANIFICACION_DEF_BY_KEY, CAPACIDADES_POR_PIEZA["planning"]);

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
      hidden: s.hidden === true,
    }));
  }, [cs.sections]);

  /* La tabla de propiedades del documento, para que los formularios elijan sus campos de ahí y avisen si uno
     ya no existe (2026-10-25). Solo el editor: el PDF y el enlace muestran los nombres guardados. */
  const propiedadesDelPlan = useMemo(() => {
    const s = cs.sections.find((x) => x.key === "propiedades");
    const d = s?.blocks.find((b) => b.blockType === "CARD")?.data as { filas?: FilaPropiedad[] } | undefined;
    return Array.isArray(d?.filas) ? d.filas : [];
  }, [cs.sections]);
  const etiquetasClave = (etiquetas ?? []).join(",");
  const ctx: LandingContext = useMemo(
    () => ({ clientName: "", planificacion: { propiedades: propiedadesDelPlan, etiquetasDelProyecto: etiquetasClave ? etiquetasClave.split(",") : [] } }),
    [propiedadesDelPlan, etiquetasClave],
  );

  /* Un documento anterior a las secciones del Brief (2026-10-25) no las tiene, y el motor solo pinta las que
     existen: sin esto aparecían recién al regenerar, y regenerar no es lo que alguien quiere para escribir sus
     usuarios. Al abrirlo se materializan una vez (`POST /pieces/[slug]`: idempotente, crea las que faltan y
     nunca borra) y se vuelve a leer. Las nuevas nacen vacías: en la vista del cliente no se ven hasta tener algo. */
  const yaReconciliado = useRef(false);
  const faltanSecciones =
    !cs.loading && cs.sections.length > 0 && PLANIFICACION_CANVAS.sections.some((c) => !cs.sections.some((s) => s.key === c.key));
  useEffect(() => {
    if (!faltanSecciones || yaReconciliado.current) return;
    yaReconciliado.current = true;
    void fetch(`/api/projects/${projectId}/pieces/${PIECE_SLUG}`, { method: "POST" })
      .then((r) => (r.ok ? (r.json() as Promise<{ canvasId?: string }>) : null))
      .then((info) => {
        // Si el reconcile cayó en OTRO canvas de la pieza, este no cambió: no hay nada que releer.
        if (info?.canvasId === canvasId) void cs.refetch();
      })
      .catch(() => {});
  }, [faltanSecciones, projectId, canvasId, cs]);

  // Aviso propio del workspace (separado de `cs.error`, que es del hook): lo usamos cuando
  // ni siquiera pudimos llegar a guardar porque la sección no existe.
  const [aviso, setAviso] = useState<string | null>(null);

  /**
   * Resuelve una `key` de la plantilla a su fila REAL en la base, MATERIALIZÁNDOLA si el
   * documento es viejo y todavía no la tiene.
   *
   * POR QUÉ existe: las planificaciones escritas con el formato anterior no traen las
   * secciones que la plantilla actual sumó (el hero, el ciclo de vida, el cierre), pero el
   * motor igual las pinta editables. Antes, editarlas terminaba en un `return` mudo — el CSE
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
    <>
    {/* El «Contexto» de este documento (sus reuniones y notas) lo monta el panel del proyecto ARRIBA
        del marco del documento (ProjectCanvasPanel, 2026-10-05). */}
    <div className="stl stl-internal">
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
            Todavía sin generar. Usá <strong>Generar planificación</strong> arriba, junto al nombre
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
          dialogTitle="Mejorar el plan con IA"
          chips={["Hazlo más concreto en tiempos y responsables", "Ancla los procesos a los diagramas reales", "Resume las secciones largas"]}
          placeholder='Ej: "detalla mejor cómo va a operar cada proceso"'
          labelFor={(key) => rotuloVigente("planning", key, cs.sections.find((s) => s.key === key)?.label ?? key)}
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
        // La paleta entra por PROP, no por el div de afuera: `LandingView` pinta su
        // propio `.stl` y volvía a declararse los tokens de marca encima. El wrapper
        // exterior se queda porque sí tiñe lo que está FUERA del motor (esqueletos y
        // la barra sticky).
        palette="internal"
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
          const heroId = idByKey.get("planificacion");
          const contentIds = keys.map((kk) => idByKey.get(kk)).filter((x): x is string => !!x);
          const ordered = [heroId, ...contentIds].filter((x): x is string => !!x);
          if (ordered.length) cs.reorderSections(ordered);
        }}
      />
    </div>
    </>
  );
}
