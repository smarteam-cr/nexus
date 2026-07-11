"use client";

/**
 * components/lifecycle/StageBadge.tsx
 *
 * Chip compacto de la ETAPA del ciclo de vida ("Etapa 3/9 · Diagnóstico") con
 * tooltip-stepper del ciclo completo (✓ etapas pasadas) al hover. `source ===
 * "override"` muestra el tag "curada" (mismo lenguaje que la salud).
 * Props primitivas a propósito: viaja igual por RSC o por JSON de API.
 */
import { useState } from "react";
import {
  FULL_CYCLE_ORDER,
  SHORT_CYCLE_ORDER,
  STAGE_LABEL_ES,
  type LifecycleCycle,
} from "@/lib/lifecycle/stage-engine";

export default function StageBadge({
  stage,
  cycle,
  source,
  reasons,
  overrideReason,
  size = "sm",
}: {
  /** Slug de la etapa efectiva (ProjectLifecycleStage). */
  stage: string;
  cycle: LifecycleCycle;
  source: "override" | "inferred";
  /** Razones legibles de la inferencia (tooltip). */
  reasons?: string[];
  overrideReason?: string | null;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const order = cycle === "short" ? SHORT_CYCLE_ORDER : FULL_CYCLE_ORDER;
  const idx = order.indexOf(stage as (typeof order)[number]);
  const label = STAGE_LABEL_ES[stage as keyof typeof STAGE_LABEL_ES] ?? stage;
  const pos = idx >= 0 ? `${idx + 1}/${order.length}` : null;

  return (
    <span
      className="relative inline-flex items-center gap-1"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        className={`inline-flex items-center gap-1 font-medium rounded border text-sky-700 bg-sky-500/10 border-sky-500/25 ${
          size === "md" ? "text-xs px-2 py-1" : "text-[10px] px-1.5 py-0.5"
        }`}
      >
        {pos ? `Etapa ${pos} · ${label}` : label}
      </span>
      {source === "override" && (
        <span
          className="text-[9px] text-fg-muted uppercase tracking-wide"
          title={overrideReason ?? "Etapa fijada a mano por el CSE"}
        >
          curada
        </span>
      )}
      {open && (
        <span className="absolute left-0 top-full z-30 mt-1.5 w-64 rounded-lg border border-line bg-surface p-2.5 shadow-lg">
          <span className="block text-[10px] font-semibold text-fg mb-1.5">
            Ciclo {cycle === "short" ? "corto (continuidad)" : "de implementación"}
          </span>
          {order.map((s, i) => (
            <span
              key={s}
              className={`flex items-center gap-1.5 text-[11px] py-0.5 ${
                i < idx ? "text-fg-muted" : i === idx ? "text-fg font-semibold" : "text-fg-muted/60"
              }`}
            >
              <span className="w-3.5 text-center">{i < idx ? "✓" : i === idx ? "●" : "○"}</span>
              {STAGE_LABEL_ES[s]}
            </span>
          ))}
          {reasons && reasons.length > 0 && (
            <span className="mt-1.5 block border-t border-line pt-1.5 text-[10px] text-fg-secondary">
              {reasons[reasons.length - 1]}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
