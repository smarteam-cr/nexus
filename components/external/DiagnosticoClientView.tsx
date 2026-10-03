"use client";

/**
 * components/external/DiagnosticoClientView.tsx
 *
 * El DIAGNÓSTICO tal como lo ve el cliente (2026-10-02): la versión PRESENTADA (ver
 * lib/external/diagnostico-view.ts). Motor `LandingView` en modo lectura, con el adaptador COMPARTIDO
 * con el editor interno, y el mismo canal `ctx.diagnostico` que el editor y el PDF: la cuarta columna
 * del problema sale de las acciones del documento, y la línea base y la meta de los objetivos, de la
 * lista de resultados del handoff.
 */
import LandingView from "@/components/landing/LandingView";
import { buildDiagnosticoConfig, buildDiagnosticoSections, ctxDelDiagnostico } from "@/components/canvas/diagnostico-landing-adapter";
import type { DiagnosticoViewData } from "@/lib/external/diagnostico-view";

export default function DiagnosticoClientView({ data }: { data: DiagnosticoViewData }) {
  const keys = data.rows.map((s) => s.key);
  const config = buildDiagnosticoConfig(keys);
  const built = buildDiagnosticoSections(data.rows);
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
          diagnostico: {
            ...ctxDelDiagnostico(sections),
            resultados: data.resultados,
            lineaDelDocumento: data.lineaDelDocumento ?? undefined,
          },
        }}
        sections={sections}
        mode="read"
      />
    </div>
  );
}
