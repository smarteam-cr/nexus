/**
 * /external/test — LA ENTRADA del test del diagnóstico de rendimiento (O6, 2026-10-26; la portada de la aplicación
 * vieja, 2026-10-28).
 *
 * La aplicación vieja tenía una sola entrada (`dev.smarteamcr.com/diagnostico-rendimiento/`) y el área se elegía
 * adentro: esta es su reemplazo para el día del corte (nginx manda la dirección vieja acá y los enlaces que ya circulan no
 * se rompen). Es la misma portada: las tarjetas a la izquierda y el formulario a la derecha, con la industria y el área
 * como campos del formulario (components/external/test/TestDelDiagnostico.tsx). Con `?area=ventas` (la página vieja lo
 * recibía de otros formularios, junto con el correo y el nombre de la persona) va a la dirección del área, que deja esa
 * área marcada; los datos de la persona NO se pasan: la dirección queda en los registros de nginx y en la historia del
 * navegador. Lo que mide la campaña (utm, gclid, fbclid) y `v=marketing` sí pasan.
 *
 * Página del cliente (§1-WEB): tema claro con hex literal, tuteo. Carga los píxeles de anuncios como la del área.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PixelesDelTest from "@/components/external/test/PixelesDelTest";
import TestDelDiagnostico from "@/components/external/test/TestDelDiagnostico";
import { consultaConIndustria, industriasDelFormulario, sufijo, type Consulta } from "@/lib/tests-diagnostico/direccion-publica";
import { PREGUNTAS_POR_VERSION } from "@/lib/tests-diagnostico/banco";
import { pixelesDelTest } from "@/lib/tests-diagnostico/pixeles";
import { areasAbiertas } from "@/lib/tests-diagnostico/repositorio-server";
import { AREA_POR_SLUG, esVersionDelTest } from "@/lib/tests-diagnostico/tipos";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Diagnóstico de Rendimiento · Smarteam",
  description: "Diagnóstico con IA de la Escala de Rendimiento Smarteam: descubre el nivel real de tu departamento.",
  robots: { index: false, follow: false },
};

export default async function EntradaDelTest({ searchParams }: { searchParams: Promise<Consulta> }) {
  const q = await searchParams;
  // Lo que pasa al área: lo que mide la campaña, la versión y la industria (lib/tests-diagnostico/direccion-publica.ts).
  const { pasa, industria } = consultaConIndustria(q);
  const area = (Array.isArray(q.area) ? q.area[0] : q.area)?.trim().toLowerCase();
  if (area && Object.hasOwn(AREA_POR_SLUG, area)) redirect(`/external/test/${area}${sufijo(pasa)}`);
  // Con el correo o el nombre en la dirección (o un área que no existe), primero se limpia: esta página carga píxeles.
  if (!consultaConIndustria(q).limpia) redirect(`/external/test${sufijo(pasa)}`);
  const v = Array.isArray(q.v) ? q.v[0] : q.v;
  const version = esVersionDelTest(v) ? v : "web";
  const pixeles = pixelesDelTest(process.env);
  // Un área sin preguntas aprobadas se ve apagada en la portada: nadie llena el formulario para enterarse al final.
  const abiertas = await areasAbiertas(version);
  return (
    <>
      <PixelesDelTest pixeles={pixeles} />
      <TestDelDiagnostico
        areaInicial={null}
        version={version}
        total={PREGUNTAS_POR_VERSION[version]}
        industriaInicial={industria}
        industrias={industriasDelFormulario()}
        logo="/logo-smarteam-blanco.png"
        abiertas={abiertas}
        conversionGoogleAds={pixeles.conversionGoogleAds}
      />
    </>
  );
}
