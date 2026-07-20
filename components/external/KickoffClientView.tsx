"use client";

/**
 * components/external/KickoffClientView.tsx
 *
 * Render del kickoff en la página del CLIENTE, sobre el motor `LandingView` (el mismo
 * que Business Cases y que el editor interno del CSE).
 *
 * Es un componente CLIENTE por una sola razón: `ctx.kickoff.onAssignSession` tiene que
 * ser una función que RECHACE cuando el servidor rechaza, para que el drag optimista de
 * `HorariosSection` revierta. La server action devuelve un resultado (no lanza), así que
 * acá se adapta a la convención del motor. La action en sí llega como prop desde el
 * server component — es el único write path del cliente externo.
 */
import LandingView from "@/components/landing/LandingView";
import { buildKickoffConfig, buildKickoffSections, missingCtxSections } from "@/components/canvas/kickoff-landing-adapter";
import type { KickoffLandingData } from "@/lib/external/kickoff-view-types";

export type AssignHorarioResult = { ok: true } | { ok: false; error: string };

export default function KickoffClientView({
  data,
  assignAction,
}: {
  data: KickoffLandingData;
  assignAction: (sessionId: string, optionId: string | null) => Promise<AssignHorarioResult>;
}) {
  const keys = data.sections.map((s) => s.key);
  const config = buildKickoffConfig(keys);
  const built = buildKickoffSections(data.sections);
  const sections = [
    ...data.sections.map((s, i) => ({
      key: s.key,
      data: built[i].data,
      titleOverride: s.titleOverride,
      eyebrowOverride: s.eyebrowOverride,
    })),
    // Cronograma/procesos que este SNAPSHOT no trae (se congeló antes de que fueran
    // CanvasSections): se inyectan como fila sintética y se pintan al final, como siempre.
    // Leen de ctx.kickoff (timeline/procesos ya resueltos y gateados por el chokepoint).
    // `cierre` NO va acá — es una CanvasSection real; si un kickoff viejo no la tiene, el
    // motor la pinta con el `empty` default.
    ...missingCtxSections(keys).map((key) => ({ key, data: {} as unknown })),
  ];

  const onAssignSession = async (sessionId: string, optionId: string | null) => {
    const res = await assignAction(sessionId, optionId);
    if (!res.ok) throw new Error(res.error);
  };

  return (
    <div className="relative">
      {/* Servicio recurrente (tag `recurrente` del handoff): badge sutil client-facing.
          El CSE lo saca quitando el tag del proyecto en el editor. Texto amable — no "recurrente". */}
      {data.recurrent && (
        <div className="absolute top-3 right-3 z-20 rounded-full border border-teal-200 bg-teal-50/90 px-3 py-1 text-[11px] font-medium text-teal-700 shadow-sm backdrop-blur">
          Servicio de continuidad
        </div>
      )}
      <LandingView
        config={config}
        ctx={{
          clientName: data.clientName || data.projectName,
          clientLogoUrl: data.clientLogoUrl,
          smarteamLogoUrl: data.smarteamLogoUrl ?? null,
          brandLogos: data.brandLogos,
          // Sin endpoints de subida en la vista del cliente → el hero no pinta los
          // botones de Portada / Logo (solo se renderizan en modo edición).
          kickoff: {
            timeline: data.timeline,
            procesos: data.procesos,
            platformLogos: data.platformLogos,
            // Única escritura habilitada para el cliente: elegir su franja horaria.
            onAssignSession,
          },
        }}
        sections={sections}
        mode="read"
      />
    </div>
  );
}
