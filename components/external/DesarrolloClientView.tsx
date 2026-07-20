"use client";

/**
 * components/external/DesarrolloClientView.tsx
 *
 * Render del canvas Desarrollo (requerimiento técnico) para un DEV externo, sobre el
 * motor `LandingView` en modo lectura. Mucho más simple que el del kickoff: sin write
 * path (no hay asignación de horarios), sin secciones ctxDriven. Usa el adaptador
 * COMPARTIDO con el editor interno → el dev ve exactamente lo que ve el CSE.
 */
import LandingView from "@/components/landing/LandingView";
import { buildDesarrolloConfig, buildDesarrolloSections } from "@/components/canvas/desarrollo-landing-adapter";
import type { DesarrolloViewData } from "@/lib/external/desarrollo-view";

export default function DesarrolloClientView({ data }: { data: DesarrolloViewData }) {
  const keys = data.rows.map((s) => s.key);
  const config = buildDesarrolloConfig(keys);
  const built = buildDesarrolloSections(data.rows);
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
          smarteamLogoUrl: data.smarteamLogoUrl ?? null,
          brandLogos: data.brandLogos,
        }}
        sections={sections}
        mode="read"
      />
    </div>
  );
}
