"use client";

import { useToast } from "@/components/ui/Toast";
import { templateDefsByKey } from "@/components/landing/configs/templates.defs";
import { esCustomKey } from "@/lib/landing/custom-sections";
import { customDef } from "@/lib/landing/catalogo-de-secciones";
import { useCanvasSections, type SectionWithBlocks } from "@/components/canvas/useCanvasSections";

/** Defs mínimas que necesita el overlay: el `empty` para "Limpiar" y `agentGenerated`
 *  para decidir si se ofrece ✨IA. El BC pasa `templateDefsByKey(templateId)`; el
 *  Kickoff pasa `KICKOFF_DEF_BY_KEY`. Así el mismo overlay sirve a los dos canvas. */
export type SectionToolsDefs = Record<string, { empty?: unknown; agentGenerated?: boolean } | undefined>;

/**
 * ── Controles por sección (overlay): limpiar y borrar. ─────────────────────
 *
 * ⚠ ACÁ ESTABA LA PÍLDORA ✨IA, y se retiró el 2026-08-22 por pedido de Elías: *«que en cada
 * sección el botón de modificar con IA lo que haga sea abrir el chat con la sección
 * referenciada»*. Lo que hacía era abrir un cuadrito de 280px, pedir una instrucción y **escribir
 * la sección al instante, sin vista previa**, con un motor distinto del que usa el resto.
 *
 * Su reemplazo vive en el chrome del propio motor (`stl-chat-seccion` en `LandingView`), así que
 * está en los OCHO documentos y no en dos, y todo pedido de cambio pasa por la misma lista
 * numerada con casillas antes de escribirse.
 *
 * Lo que se queda acá son los dos gestos DETERMINÍSTICOS: vaciar y borrar. Rutearlos por un modelo
 * para terminar escribiendo un objeto vacío sería absurdo.
 */
export default function SectionTools({
  section,
  hook,
  isTemplate,
  templateId,
  defsByKey,
}: {
  section: SectionWithBlocks | undefined;
  hook: ReturnType<typeof useCanvasSections>;
  isTemplate: boolean;
  /** BC: resuelve las defs por template. Ignorado si viene `defsByKey`. */
  templateId?: string | null;
  /** Kickoff (u otro canvas): defs explícitas. Tiene prioridad sobre `templateId`. */
  defsByKey?: SectionToolsDefs;
}) {
  const toast = useToast();
  const defs: SectionToolsDefs = defsByKey ?? templateDefsByKey(templateId);
  // El bloque TIPADO de la sección. El kickoff puede tener bloques TEXT legacy
  // delante del CARD → preferir siempre el CARD.
  const block = section?.blocks.find((b) => b.blockType === "CARD") ?? section?.blocks[0];
  // En la Plantilla se editan las GUÍAS (no el contenido) → sin controles de sección.
  // Sin bloque (secciones ctxDriven: cronograma/procesos) → tampoco hay qué regenerar.
  if (isTemplate || !section || !block) return null;
  /* La def de ESTA sección. Para una personalizada (`custom:*`) el mapa del template no
     tiene nada, y los dos usos de abajo fallan al revés de como uno esperaría:
     `agentGenerated` daría `undefined !== false` = TRUE (o sea, se ofrecería ✨IA sobre
     una sección que el server rechaza), y "Limpiar" escribiría `{}` en vez del `empty`
     real — dejando la sección con un shape que el componente no espera. */
  const def = defs[section.key] ?? (esCustomKey(section.key) ? customDef(section.key, section.label) : undefined);

  // Borrar la sección personalizada. Sin undo (la fila desaparece, no hay `previousData`
  // que restaurar), así que la confirmación explícita ES el mecanismo de seguridad.
  const borrar = async () => {
    const nombre = section.titleOverride?.trim() || section.label;
    if (!confirm(`¿Borrar la sección "${nombre}"?\n\nSe va de ESTA versión de la propuesta. Las versiones anteriores y lo que ya subiste al cliente la conservan.`)) return;
    const ok = await hook.removeSection(section.id);
    if (ok) toast.success("Sección borrada.");
  };

  // Vaciar la sección → vuelve al placeholder (no se ve en el cliente). Undo vía previousData.
  const clear = async () => {
    const empty = (def?.empty ?? {}) as Record<string, unknown>;
    const ok = await hook.saveBlock(section.id, block.id, { data: empty });
    if (ok) toast.info("Sección vaciada (el cliente no la verá).");
  };

  // Pills del chrome — MISMO look que el HideToggle estandarizado (kickoff): píldora
  // blanca translúcida con blur. El toggle de ocultar vive en LandingView.
  const pill: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 9px",
    borderRadius: 999, cursor: "pointer", fontSize: 11, fontWeight: 600, lineHeight: 1,
    border: "1px solid rgba(0,0,0,0.12)", background: "rgba(255,255,255,0.92)",
    color: "#6b7280", backdropFilter: "blur(4px)", boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  };

  // `position: relative` acá + popover `absolute` anclado a ESTE wrapper (no al de
  // `.stl-overlay`): así el popover deja de aportar altura al item flex de SectionTools
  // dentro de `.stl-overlay` (que es `align-items:center`) — sin esto, al abrir el
  // popover el wrapper crecía de 1 fila a 2, y ese crecimiento recentraba visualmente
  // a los OTROS hermanos del overlay ("👁 Visible" y el drag-handle "⠿").
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "flex-end" }}>
      <div style={{ display: "flex", gap: 6 }}>
        <button style={{ ...pill, color: "#b91c1c" }} onClick={clear} title="Vaciar el contenido de esta sección" aria-label="Vaciar el contenido de esta sección">
          🗑 Limpiar
        </button>
        {/* Borrar SOLO para las personalizadas: las de la plantilla se ocultan (el server
            también lo rechaza). Sin undo → confirmación explícita, y el copy dice qué
            alcance tiene: esta versión, no las anteriores ni lo ya publicado. */}
        {esCustomKey(section.key) && (
          <button
            style={{ ...pill, color: "#b91c1c" }}
            onClick={borrar}
            title="Borrar esta sección personalizada"
            aria-label="Borrar esta sección personalizada"
          >
            ✕ Borrar sección
          </button>
        )}
      </div>
    </div>
  );
}
