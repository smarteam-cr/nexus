/**
 * /external/test/[area] — EL TEST PÚBLICO del diagnóstico de rendimiento de un departamento (área O, 2026-10-26).
 *
 * `ventas`, `marketing` o `servicio`; `?v=marketing` abre la versión de 4 preguntas (sin `v`, la web de 8). Sin login:
 * cualquiera la abre desde la web de Smarteam o un enlace de campaña. Sin preguntas APROBADAS para esa área y versión, la
 * página dice que el test todavía no está abierto: nadie llena preguntas que Elías no revisó.
 *
 * Página del cliente (§1-WEB): tema claro con hex literal, tuteo, sin el chrome de un proyecto.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ExternalShell from "@/components/external/ExternalShell";
import TestDelDiagnostico from "@/components/external/test/TestDelDiagnostico";
import { INDUSTRIAS_DE_SMARTEAM } from "@/lib/clients/datos-de-la-empresa";
import { getBrandLogos } from "@/lib/external/smarteam-logo";
import { aprobadasPara } from "@/lib/tests-diagnostico/repositorio-server";
import { AREA_POR_SLUG, NOMBRE_DEL_AREA, esVersionDelTest } from "@/lib/tests-diagnostico/tipos";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Diagnóstico de Rendimiento · Smarteam",
  robots: { index: false, follow: false },
};

export default async function TestPage({ params, searchParams }: { params: Promise<{ area: string }>; searchParams: Promise<{ v?: string }> }) {
  const [{ area }, { v }] = await Promise.all([params, searchParams]);
  const areaId = AREA_POR_SLUG[area];
  if (!areaId) notFound();
  const version = esVersionDelTest(v) ? v : "web";
  const [aprobadas, logos] = await Promise.all([aprobadasPara(areaId, version, null).catch(() => null), getBrandLogos()]);

  return (
    <ExternalShell smarteamLogoUrl={logos.smarteam}>
      {aprobadas ? (
        <TestDelDiagnostico area={area} areaNombre={NOMBRE_DEL_AREA[areaId]} version={version} total={aprobadas.preguntas.length}
          industrias={INDUSTRIAS_DE_SMARTEAM.map(({ valor, etiqueta }) => ({ valor, etiqueta }))}
        />
      ) : (
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "64px 20px", fontFamily: "var(--font-jakarta), system-ui, sans-serif", color: "#0f1b3d" }}>
          <h1 style={{ fontSize: 26, margin: "0 0 10px" }}>Este test todavía no está abierto</h1>
          <p style={{ fontSize: 16, color: "#5b6a8a", lineHeight: 1.6, margin: 0 }}>
            Estamos terminando de prepararlo. Vuelve a intentarlo en unos días o escríbenos para conversar sobre tu área de {NOMBRE_DEL_AREA[areaId]}.
          </p>
        </div>
      )}
    </ExternalShell>
  );
}
