"use client";

/**
 * components/external/PlanificacionClientView.tsx
 *
 * El PLANIFICACIÓN tal como lo ve el cliente (2026-10-02). Motor `LandingView` en modo lectura, con el
 * adaptador COMPARTIDO con el editor interno: el CSE revisa exactamente lo que el cliente abre.
 * Mismo molde que EntregaClientView.
 */
import LandingView from "@/components/landing/LandingView";
import { buildPlanificacionConfig, buildPlanificacionSections } from "@/components/canvas/planificacion-landing-adapter";
import type { PlanificacionViewData } from "@/lib/external/planificacion-view";
import type { OperacionDelCliente } from "@/lib/planificacion/lo-del-cliente";

export default function PlanificacionClientView({
  data,
  guardar,
}: {
  data: PlanificacionViewData;
  /** Lo que escribe el cliente en una sección abierta (L4 etapa 6): la server action atada a este acceso. */
  guardar?: (op: OperacionDelCliente) => Promise<{ ok: boolean; error?: string }>;
}) {
  const keys = data.rows.map((s) => s.key);
  const config = buildPlanificacionConfig(keys);
  const built = buildPlanificacionSections(data.rows);
  const sections = data.rows.map((s, i) => ({
    key: s.key,
    data: built[i].data,
    titleOverride: s.titleOverride,
    eyebrowOverride: s.eyebrowOverride,
  }));

  return (
    <div>
      <LandingView
        config={config}
        ctx={{
          clientName: data.clientName || data.projectName,
          clientLogoUrl: data.clientLogoUrl,
          clientLogoDarkUrl: data.clientLogoDarkUrl,
          clientLogoScale: data.clientLogoScale,
          smarteamLogoUrl: data.smarteamLogoUrl ?? null,
          brandLogos: data.brandLogos,
          ...(guardar ? { planificacion: { cliente: { guardar } } } : {}),
        }}
        sections={sections}
        mode="read"
      />
    </div>
  );
}
