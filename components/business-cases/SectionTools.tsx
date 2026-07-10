"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { templateDefsByKey } from "@/components/landing/configs/templates.defs";
import { useCanvasSections, type SectionWithBlocks } from "@/components/canvas/useCanvasSections";

// ── Controles por sección (overlay): IA + ocultar + limpiar. Solo en casos, no en la Plantilla. ──
export default function SectionTools({
  section,
  hook,
  isTemplate,
  templateId,
}: {
  section: SectionWithBlocks | undefined;
  hook: ReturnType<typeof useCanvasSections>;
  isTemplate: boolean;
  templateId?: string | null;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [instr, setInstr] = useState("");
  const [busy, setBusy] = useState(false);
  const block = section?.blocks[0];
  // En la Plantilla se editan las GUÍAS (no el contenido) → sin controles de sección.
  if (isTemplate || !section || !block) return null;
  // Secciones determinísticas (agentGenerated:false, p.ej. casos_de_uso): sin ✨ IA
  // (el server igual devuelve 400) — se editan a mano o desde el checklist.
  const aiAllowed = templateDefsByKey(templateId)[section.key]?.agentGenerated !== false;

  const regen = async () => {
    if (!instr.trim() || busy) return;
    setBusy(true);
    try {
      const r = await hook.regenerateBlock(section.id, block.id, instr.trim());
      if (r) {
        await hook.saveBlock(section.id, block.id, { data: r.data });
        toast.success("Sección reescrita por IA.");
        setInstr("");
        setOpen(false);
      }
    } finally {
      setBusy(false);
    }
  };

  // Vaciar la sección → vuelve al placeholder (no se ve en el cliente). Undo vía previousData.
  const clear = async () => {
    const empty = (templateDefsByKey(templateId)[section.key]?.empty ?? {}) as Record<string, unknown>;
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
        {aiAllowed && (
          <button style={{ ...pill, color: "#168CF6" }} onClick={() => setOpen((o) => !o)} title="Editar con IA" aria-label="Editar esta sección con IA" aria-expanded={open}>
            ✨ IA
          </button>
        )}
        <button style={{ ...pill, color: "#b91c1c" }} onClick={clear} title="Vaciar el contenido de esta sección" aria-label="Vaciar el contenido de esta sección">
          🗑 Limpiar
        </button>
      </div>
      {open && (
        <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 6, display: "flex", gap: 6, background: "#fff", border: "1px solid rgba(15,23,42,0.12)", borderRadius: 10, padding: 6, boxShadow: "0 8px 24px -8px rgba(15,23,42,0.35)", width: 280, zIndex: 10 }}>
          <input
            value={instr}
            onChange={(e) => setInstr(e.target.value)}
            placeholder="Ej. más concreto y orientado a ventas"
            onKeyDown={(e) => { if (e.key === "Enter") regen(); }}
            style={{ flex: 1, fontSize: 12, padding: "6px 8px", border: "1px solid #E5E7EB", borderRadius: 7, color: "#0f172a", outline: "none" }}
          />
          <button onClick={regen} disabled={busy || !instr.trim()} style={{ ...pill, color: "#fff", background: "#168CF6", borderColor: "#168CF6", opacity: busy || !instr.trim() ? 0.5 : 1 }}>
            {busy ? "…" : "Aplicar"}
          </button>
        </div>
      )}
    </div>
  );
}
