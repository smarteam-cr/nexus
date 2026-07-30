"use client";

/**
 * components/lifecycle/StageBadge.tsx
 *
 * Chip compacto de la ETAPA ("Etapa 3/9 · Diagnóstico") con tooltip-stepper de la línea
 * completa (✓ etapas pasadas) al hover. `source === "override"` muestra el tag "curada"
 * (mismo lenguaje que la salud). Props primitivas a propósito: viaja igual por RSC o por
 * JSON de API.
 *
 * ── DOS LÍNEAS, UN SOLO CHIP ─────────────────────────────────────────────────
 * Sin `order`, pinta el ciclo de 8 etapas de Customer Success (`cycle`) — lo de siempre.
 * Con `order`, pinta LA LÍNEA QUE LE PASARON y no sabe nada de pipelines: es lo que impide
 * que mañana haya un `if (pipeline === "development")` adentro de un componente de React.
 *
 * Si la etapa actual NO está en la línea (Cancelado, Bloqueado, o una etapa que HubSpot
 * agregó y nadie transcribió), va sin "Etapa i/N" y en tono NEUTRO: un "Cancelado" pintado
 * en el azul del avance se lee como progreso.
 *
 * ⚠ Esa regla es UNA SOLA para los dos casos, y eso alcanza al ciclo de CS: un proyecto de
 * ciclo corto con la etapa curada a una que solo existe en el ciclo completo también sale
 * neutro (antes salía azul, sin posición). Es más honesto —está fuera de SU línea— y hoy no
 * afecta a nadie: cero proyectos tienen la etapa curada a mano (medido 2026-07-30).
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
  order,
  label: labelProp,
  stepperTitle,
}: {
  /** Identificador de la etapa efectiva: slug de ProjectLifecycleStage, o id de etapa de HubSpot. */
  stage: string;
  /** El ciclo de Customer Success. Se ignora si viene `order`. */
  cycle?: LifecycleCycle;
  source: "override" | "inferred";
  /** Razones legibles de la inferencia (tooltip). */
  reasons?: string[];
  overrideReason?: string | null;
  size?: "sm" | "md";
  /** La línea de avance a pintar. Ausente = la del ciclo de CS. */
  order?: ReadonlyArray<{ id: string; label: string }>;
  /** Rótulo de la etapa actual. Necesario cuando la etapa está FUERA de `order`. */
  label?: string;
  stepperTitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const linea =
    order ??
    (cycle === "short" ? SHORT_CYCLE_ORDER : FULL_CYCLE_ORDER).map((s) => ({
      id: s,
      label: STAGE_LABEL_ES[s],
    }));
  const idx = linea.findIndex((e) => e.id === stage);
  const enLinea = idx >= 0;
  const label =
    labelProp ??
    linea[idx]?.label ??
    STAGE_LABEL_ES[stage as keyof typeof STAGE_LABEL_ES] ??
    stage;
  const titulo =
    stepperTitle ?? `Ciclo ${cycle === "short" ? "corto (continuidad)" : "de implementación"}`;

  return (
    <span
      className="relative inline-flex items-center gap-1"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        className={`inline-flex items-center gap-1 font-medium rounded border ${
          enLinea
            ? "text-sky-700 bg-sky-500/10 border-sky-500/25"
            : "text-fg-secondary bg-surface-muted border-line"
        } ${size === "md" ? "text-xs px-2 py-1" : "text-[10px] px-1.5 py-0.5"}`}
      >
        {enLinea ? `Etapa ${idx + 1}/${linea.length} · ${label}` : label}
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
          <span className="block text-[10px] font-semibold text-fg mb-1.5">{titulo}</span>
          {linea.map((e, i) => (
            <span
              key={e.id}
              className={`flex items-center gap-1.5 text-[11px] py-0.5 ${
                i < idx ? "text-fg-muted" : i === idx ? "text-fg font-semibold" : "text-fg-muted/60"
              }`}
            >
              <span className="w-3.5 text-center">{i < idx ? "✓" : i === idx ? "●" : "○"}</span>
              {e.label}
            </span>
          ))}
          {!enLinea && (
            <span className="mt-1.5 block border-t border-line pt-1.5 text-[10px] text-fg-secondary">
              «{label}» está fuera de la línea de avance.
            </span>
          )}
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
