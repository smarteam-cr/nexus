"use client";

/**
 * components/canvas/KickoffWorkspace.tsx
 *
 * Editor interno (CSE) del Kickoff sobre el motor `LandingView` (mismo que Business
 * Cases): drag&drop de secciones, edición tipada por campos, ocultar/mostrar, y
 * "Subir al cliente". Reusa la capa de datos (useKickoffData) del renderer viejo.
 *
 * Adaptador motor↔kickoff:
 *  - config: secciones de CONTENIDO en el orden vivo de CanvasSection; hero pinneado
 *    primero; cronograma/procesos/cierre pinneados al final (ctxDriven, de ctx.kickoff).
 *  - sections: `blocks[CARD].data` (tipado) o `__legacyMd` (markdown viejo, fallback).
 *  - visibilidad: `hidden` ↔ `hiddenKickoffKeys` (por id de sección real; por key para
 *    las sintéticas cronograma/procesos).
 *  - onReorder → reorderSections (keys→ids, bienvenida siempre primero).
 *
 * El renderer viejo sigue disponible con `?kve=old` (rollback) — ver ProjectCanvasPanel.
 */
import { useCallback, useMemo } from "react";
import LandingView, { type LandingSectionData } from "@/components/landing/LandingView";
import type { LandingContext } from "@/components/landing/types";
import SectionTools from "@/components/business-cases/SectionTools";
import { KICKOFF_DEF_BY_KEY } from "@/components/landing/configs/kickoff.defs";
import PublishBar from "./PublishBar";
import { useKickoffData } from "./useKickoffData";
import {
  buildKickoffConfig,
  buildKickoffSections,
  missingCtxSections,
  kickoffHiddenKey,
  KICKOFF_CTX_SECTIONS,
} from "./kickoff-landing-adapter";
import { applyAssignments, HORARIOS_KEY } from "@/lib/kickoff/horario-assignments";

const MAXW = 760;

export default function KickoffWorkspace({ projectId, canvasId }: { projectId: string; canvasId: string }) {
  const k = useKickoffData(projectId, canvasId);

  const idByKey = useMemo(() => new Map(k.sections.map((s) => [s.key, s.id])), [k.sections]);

  // Config + data por sección vía el adaptador COMPARTIDO (idéntico a la vista externa).
  // k.sections ya viene ordenado por CanvasSection.order (GET orderBy order).
  const config = useMemo(() => buildKickoffConfig(k.sections.map((s) => s.key)), [k.sections]);

  const sections: LandingSectionData[] = useMemo(() => {
    const built = buildKickoffSections(k.sections);
    const real = k.sections.map((s, i) => ({
      key: s.key,
      // La asignación de horarios vive en un overlay vivo (no en el bloque): se superpone
      // acá para que el CSE vea al instante la franja que eligió el cliente.
      data: s.key === HORARIOS_KEY
        ? applyAssignments(built[i].data, k.horarioAssignments)
        : built[i].data,
      titleOverride: s.titleOverride,
      eyebrowOverride: s.eyebrowOverride,
      hidden: k.hiddenKeys.has(kickoffHiddenKey(s.key, s.id)),
    }));
    // Cronograma/procesos que este canvas todavía NO tiene como CanvasSection (pre-backfill):
    // se inyectan como fila sintética para que igual se rindan (al final, como antes).
    // `cierre` NO va acá — es una CanvasSection real (llega en `real`, con su CTA).
    const synthetic: LandingSectionData[] = missingCtxSections(k.sections.map((s) => s.key)).map((key) => ({
      key,
      data: {},
      hidden: k.hiddenKeys.has(key),
    }));
    // Defensa: `cierre` es `pinned` → el motor SIEMPRE lo rinde editable. Si el kickoff
    // aún no tiene su CanvasSection (pre-backfill), no hay bloque donde persistir →
    // marcamos `__noSection` para mostrarlo en solo-lectura + aviso (nunca edición
    // perdida en silencio). Con seed/backfill, `cierre` está en `real` y esto no aplica.
    const hasCierre = k.sections.some((s) => s.key === "cierre");
    const cierreFallback: LandingSectionData[] = hasCierre
      ? []
      : [{ key: "cierre", data: { __noSection: true } }];
    return [...real, ...synthetic, ...cierreFallback];
  }, [k.sections, k.hiddenKeys, k.horarioAssignments]);

  // Al subir un logo nuevo el hero debe repintarlo sin recargar.
  const onClientLogoChange = useCallback((url: string | null) => k.setClientLogoUrl(url), [k]);

  const ctx: LandingContext = useMemo(
    () => ({
      clientName: k.clientName,
      clientLogoUrl: k.clientLogoUrl,
      // Piezas del hero, idénticas a las que consume el hero del Business Case.
      smarteamLogoUrl: k.smarteamLogoUrl,
      brandLogos: k.brandLogos,
      imageUploadUrl: `/api/projects/${projectId}/images`,
      clientLogoUploadUrl: k.clientId ? `/api/clients/${k.clientId}/logo` : null,
      onClientLogoChange,
      kickoff: {
        timeline: k.timeline,
        procesos: k.procesos,
        platformLogos: k.platformLogos,
        onProcesoStatusChange: k.confirmProceso,
        // Ocultar cronograma/procesos: la key sintética va directo a hiddenKickoffKeys.
        hiddenKeys: k.hiddenKeys,
        onToggleHidden: k.toggleHidden,
        // Coordinación (no contenido): se guarda al instante, sin "Subir al cliente".
        onAssignSession: k.assignSession,
      },
    }),
    [
      projectId, k.clientName, k.clientLogoUrl, k.smarteamLogoUrl, k.brandLogos, k.clientId,
      onClientLogoChange, k.timeline, k.procesos, k.platformLogos, k.confirmProceso,
      k.hiddenKeys, k.toggleHidden, k.assignSession,
    ],
  );

  if (k.loading) {
    return (
      <div className="kickoff-landing">
        <div style={{ maxWidth: MAXW, margin: "0 auto", padding: "48px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton-shimmer" style={{ height: 120, borderRadius: 16 }} />
          ))}
        </div>
      </div>
    );
  }

  const draftProcesos = k.procesos.filter((p) => p.status === "DRAFT").length;

  return (
    <div className="kickoff-landing">
      {k.error && (
        <div style={{ position: "sticky", top: 0, zIndex: 50, display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "#fef2f2", borderBottom: "1px solid #fecaca", color: "#b91c1c", fontSize: 13 }}>
          <span style={{ flex: 1 }}>{k.error}</span>
          <button onClick={() => k.clearError()} title="Cerrar" style={{ color: "#b91c1c", background: "transparent", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}
      <PublishBar
        sticky
        hideWhenClean
        unpublished={k.dirty || draftProcesos > 0}
        onPublish={k.publishChanges}
        publishing={k.publishing}
        savedMessage={`Cambios guardados${draftProcesos > 0 ? ` (${draftProcesos} ${draftProcesos === 1 ? "proceso sin confirmar" : "procesos sin confirmar"})` : ""} — el cliente todavía no los ve.`}
      />
      <LandingView
        config={config}
        ctx={ctx}
        sections={sections}
        mode="edit"
        showBriefs={false}
        // Mismo overlay que el editor de Business Cases: ✨IA + 🗑Limpiar por sección.
        // El ojo 👁 (ocultar) y el handle ⠿ (mover) los pinta el propio motor.
        // Sin bloque (cronograma/procesos, que se alimentan de ctx) devuelve null.
        renderOverlay={(key) => (
          <SectionTools
            section={k.sections.find((s) => s.key === key)}
            hook={k}
            isTemplate={false}
            defsByKey={KICKOFF_DEF_BY_KEY}
          />
        )}
        onSectionChange={(key, data) => {
          const s = k.sections.find((x) => x.key === key);
          if (!s) return; // sección inexistente (sintética o `cierre` pre-backfill)
          // Cronograma/procesos NO tienen bloque: su contenido vive en ProjectTimeline y en
          // los flowcharts. Su CanvasSection existe solo por el `order` — nunca sembrarle un CARD.
          if (KICKOFF_CTX_SECTIONS.includes(key as (typeof KICKOFF_CTX_SECTIONS)[number])) return;
          const cardBlock = s.blocks.find((b) => b.blockType === "CARD");
          // Legacy con bloques TEXT y sin CARD: read-only (manda el fallback markdown).
          if (!cardBlock && s.blocks.length > 0) return;
          // Sin CARD y sin bloques (sección creada por un reconcile pero nunca generada):
          // `upsertCardData` lo crea. Antes la edición se descartaba EN SILENCIO.
          void k.upsertCardData(s.id, cardBlock?.id ?? null, data);
        }}
        onTitleChange={(key, title) => {
          const id = idByKey.get(key);
          if (id) k.renameSection(id, title);
        }}
        onEyebrowChange={(key, eyebrow) => {
          const id = idByKey.get(key);
          if (id) k.setEyebrow(id, eyebrow);
        }}
        onToggleHidden={(key, hidden) => {
          // La mayoría se oculta por id de CanvasSection; cronograma/procesos por su KEY
          // (compatibilidad con los 133 y con el gate del chokepoint). Ver kickoffHiddenKey.
          k.toggleHidden(kickoffHiddenKey(key, idByKey.get(key)), hidden);
        }}
        onReorder={(keys) => {
          // keys = las de CONTENIDO en el orden nuevo (el motor excluye hero y cierre, pinneados).
          // Incluye cronograma/procesos: son CanvasSections reales, con `order` propio.
          // Un kickoff pre-backfill no las tiene → `idByKey` no las resuelve y se filtran solas.
          // Las no enviadas (cierre) las deja al final el propio endpoint PATCH.
          const bienvenidaId = idByKey.get("bienvenida");
          const contentIds = keys.map((kk) => idByKey.get(kk)).filter((x): x is string => !!x);
          const ordered = [bienvenidaId, ...contentIds].filter((x): x is string => !!x);
          if (ordered.length) k.reorderSections(ordered);
        }}
      />
    </div>
  );
}
