"use client";

/**
 * components/external/EntregaClientView.tsx
 *
 * El documento de ENTREGA tal como lo ve el cliente. Motor `LandingView` en modo lectura,
 * con el adaptador COMPARTIDO con el editor interno — el CSE revisa exactamente lo que el
 * cliente abre, que en un documento de cierre no es un lujo: es lo que le permite decir «te
 * mandé esto» sin haber tenido que abrir el enlace él mismo.
 *
 * ⚠ SIN FECHA DE CORTE EN PANTALLA (decisión de Elías, 2026-08-13). Lo que el cliente lee es
 * un SNAPSHOT congelado el día que se publicó. La fecha queda guardada en
 * `Project.entregaPublishedAt` y viaja hasta acá en `EntregaViewData.publishedAt`, pero HOY
 * NINGUNA pantalla la muestra —ni la del cliente ni la del equipo, que solo ve el booleano
 * «publicado» en el panel de acceso—. Volver a mostrarla es una línea de JSX.
 */
import LandingView from "@/components/landing/LandingView";
import { buildEntregaConfig, buildEntregaSections } from "@/components/canvas/entrega-landing-adapter";
import type { EntregaViewData } from "@/lib/external/entrega-view";

export default function EntregaClientView({ data }: { data: EntregaViewData }) {
  const keys = data.rows.map((s) => s.key);
  const config = buildEntregaConfig(keys);
  const built = buildEntregaSections(data.rows);
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
        }}
        sections={sections}
        mode="read"
      />
    </div>
  );
}
