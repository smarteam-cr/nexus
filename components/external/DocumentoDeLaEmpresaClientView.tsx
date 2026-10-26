"use client";

/**
 * components/external/DocumentoDeLaEmpresaClientView.tsx — un documento de la EMPRESA tal como lo ve la empresa (R3 etapa
 * 3, 2026-10-27): hoy el diagnóstico. Motor `LandingView` en lectura con el adaptador COMPARTIDO con el editor interno
 * (components/clients/DocumentoDeLaEmpresaWorkspace.tsx): quien lo escribe ve exactamente lo que la empresa abre.
 */
import LandingView from "@/components/landing/LandingView";
import { buildDiagnosticoConfig, buildDiagnosticoSections, ctxDelDiagnostico } from "@/components/canvas/diagnostico-landing-adapter";
import type { DocumentoDeLaEmpresaViewData } from "@/lib/external/documento-de-la-empresa-view";

export default function DocumentoDeLaEmpresaClientView({ data }: { data: DocumentoDeLaEmpresaViewData }) {
  const config = buildDiagnosticoConfig(data.rows.map((s) => s.key));
  const built = buildDiagnosticoSections(data.rows);
  const sections = data.rows.map((s, i) => ({
    key: s.key,
    data: built[i].data,
    titleOverride: s.titleOverride,
    eyebrowOverride: s.eyebrowOverride,
  }));
  return (
    <LandingView
      config={config}
      ctx={{
        clientName: data.clientName,
        clientLogoUrl: data.clientLogoUrl,
        clientLogoDarkUrl: data.clientLogoDarkUrl,
        clientLogoScale: data.clientLogoScale,
        smarteamLogoUrl: data.smarteamLogoUrl,
        brandLogos: data.brandLogos,
        // Sin proyecto no hay resultados del handoff: los objetivos se leen como están escritos.
        diagnostico: ctxDelDiagnostico(sections),
      }}
      sections={sections}
      mode="read"
    />
  );
}
