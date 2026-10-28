/**
 * /external/test/[area] — EL TEST PÚBLICO del diagnóstico de rendimiento de un departamento (área O, 2026-10-26).
 *
 * `ventas`, `marketing` o `servicio`; `?v=marketing` abre la versión de 4 preguntas (sin `v`, la web de 8). Sin login:
 * cualquiera la abre desde la web de Smarteam o un enlace de campaña. Es la misma portada de la entrada (la de la
 * aplicación vieja, 2026-10-28) con esta área ya marcada; la persona puede cambiarla en el formulario. Sin preguntas
 * APROBADAS para esa área y versión, la página dice que el test todavía no está abierto: nadie llena preguntas que Elías
 * no revisó.
 *
 * La INDUSTRIA es un campo del formulario y decide el banco al empezar (el de su edición o, si no tiene, el de la
 * general). Si la dirección la trae (`?industria=…`, de la lista), llega elegida.
 *
 * Página del cliente (§1-WEB): tema claro con hex literal, tuteo, sin el chrome de un proyecto. Carga los píxeles de
 * anuncios de la página vieja, cada uno solo si su variable está puesta (O6 etapa 2, lib/tests-diagnostico/pixeles.ts).
 */
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import PixelesDelTest from "@/components/external/test/PixelesDelTest";
import TestDelDiagnostico from "@/components/external/test/TestDelDiagnostico";
import "@/components/external/test/diagnostico.css";
import { PREGUNTAS_POR_VERSION } from "@/lib/tests-diagnostico/banco";
import { consultaConIndustria, industriasDelFormulario, sufijo, type Consulta } from "@/lib/tests-diagnostico/direccion-publica";
import { pixelesDelTest } from "@/lib/tests-diagnostico/pixeles";
import { areasAbiertas } from "@/lib/tests-diagnostico/repositorio-server";
import { AREA_POR_SLUG, NOMBRE_DEL_AREA, esVersionDelTest } from "@/lib/tests-diagnostico/tipos";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Diagnóstico de Rendimiento · Smarteam",
  description: "Diagnóstico con IA de la Escala de Rendimiento Smarteam: descubre el nivel real de tu departamento.",
  robots: { index: false, follow: false },
};

const LOGO = "/logo-smarteam-blanco.png";

export default async function TestPage({ params, searchParams }: { params: Promise<{ area: string }>; searchParams: Promise<Consulta> }) {
  const [{ area }, q] = await Promise.all([params, searchParams]);
  const v = Array.isArray(q.v) ? q.v[0] : q.v;
  // `hasOwn`: «constructor» o «__proto__» en la dirección no son un área (con el corchete solo, daban una función).
  const areaId = Object.hasOwn(AREA_POR_SLUG, area) ? AREA_POR_SLUG[area] : undefined;
  if (!areaId) notFound();
  // Con el correo o el nombre en la dirección, primero se limpia: esta página carga píxeles (direccion-publica.ts).
  const { pasa, industria, limpia } = consultaConIndustria(q);
  if (!limpia) redirect(`/external/test/${area}${sufijo(pasa)}`);
  const version = esVersionDelTest(v) ? v : "web";
  // El banco de la general decide si un test está abierto (el de una edición cae a ella); las otras áreas cerradas se ven
  // apagadas en el formulario.
  const abiertas = await areasAbiertas(version);
  const pixeles = pixelesDelTest(process.env);

  return (
    <>
      <PixelesDelTest pixeles={pixeles} />
      {abiertas.includes(area) ? (
        <TestDelDiagnostico
          areaInicial={area}
          version={version}
          total={PREGUNTAS_POR_VERSION[version]}
          industriaInicial={industria}
          industrias={industriasDelFormulario()}
          logo={LOGO}
          abiertas={abiertas}
          conversionGoogleAds={pixeles.conversionGoogleAds}
        />
      ) : (
        <div className="dr dr-pasos">
          <header className="topbar">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <span className="brand"><img src={LOGO} alt="Smarteam" height={28} /></span>
          </header>
          <main className="app">
            <div className="step-wrap">
              <article className="step-card cerrado">
                <h2>Este test todavía no está abierto</h2>
                <p>
                  Estamos terminando de prepararlo. Vuelve a intentarlo en unos días o escríbenos para conversar sobre tu área de {NOMBRE_DEL_AREA[areaId]}.
                </p>
              </article>
            </div>
          </main>
        </div>
      )}
    </>
  );
}
