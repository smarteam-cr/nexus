/**
 * /external/test — ELEGIR EL ÁREA del test del diagnóstico de rendimiento (O6, 2026-10-26).
 *
 * La aplicación vieja tenía una sola entrada (`dev.smarteamcr.com/diagnostico-rendimiento/`) y el área se elegía
 * adentro; en Nexus cada área tiene su página. Esta es la entrada única para el día del corte: nginx manda la dirección
 * vieja acá y los enlaces que ya circulan no se rompen. Pasa a la página del área lo que mide la campaña (utm, gclid,
 * fbclid) y `v=marketing`, para que la atribución de anuncios no se pierda en el salto. Con `?area=ventas` (la página
 * vieja la recibía de otros formularios, junto con el correo y el nombre de la persona) va directo a esa área; los datos
 * de la persona NO se pasan: la dirección queda en los registros de nginx y en la historia del navegador.
 *
 * Página del cliente (§1-WEB): tema claro con hex literal, tuteo. Carga los píxeles de anuncios como la del área.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import ExternalShell from "@/components/external/ExternalShell";
import PixelesDelTest from "@/components/external/test/PixelesDelTest";
import { getBrandLogos } from "@/lib/external/smarteam-logo";
import { consultaLimpia, estaLimpia, sufijo, type Consulta } from "@/lib/tests-diagnostico/direccion-publica";
import { pixelesDelTest } from "@/lib/tests-diagnostico/pixeles";
import { AREA_POR_SLUG, NOMBRE_DEL_AREA, SLUG_POR_AREA } from "@/lib/tests-diagnostico/tipos";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Diagnóstico de Rendimiento · Smarteam",
  robots: { index: false, follow: false },
};

const QUE_MIDE: Record<string, string> = {
  "1": "Tu equipo comercial: cómo vende, con qué herramientas, qué datos usa y cómo está organizado.",
  "2": "Tu equipo de marketing: cómo atrae prospectos, con qué herramientas, qué datos usa y cómo está organizado.",
  "3": "Tu equipo de servicio: cómo atiende a tus clientes, con qué herramientas, qué datos usa y cómo está organizado.",
};

export default async function ElegirElArea({ searchParams }: { searchParams: Promise<Consulta> }) {
  const [q, logos] = await Promise.all([searchParams, getBrandLogos()]);
  // Lo que pasa al área: lo que mide la campaña y la versión (lib/tests-diagnostico/direccion-publica.ts).
  const pasa = consultaLimpia(q);
  const area = (Array.isArray(q.area) ? q.area[0] : q.area)?.trim().toLowerCase();
  if (area && Object.hasOwn(AREA_POR_SLUG, area)) redirect(`/external/test/${area}${sufijo(pasa)}`);
  // Con el correo o el nombre en la dirección (o un área que no existe), primero se limpia: esta página carga píxeles.
  if (!estaLimpia(q)) redirect(`/external/test${sufijo(pasa)}`);
  return (
    <ExternalShell smarteamLogoUrl={logos.smarteam}>
      <PixelesDelTest pixeles={pixelesDelTest(process.env)} />
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "56px 20px 72px", fontFamily: "var(--font-jakarta), system-ui, sans-serif", color: "#0f1b3d" }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "#E8481C" }}>Diagnóstico de Rendimiento</p>
        <h1 style={{ fontSize: 30, lineHeight: 1.2, margin: "8px 0 10px" }}>¿Qué área quieres medir?</h1>
        <p style={{ fontSize: 16, color: "#5b6a8a", lineHeight: 1.6, margin: "0 0 28px" }}>
          Respondes unas preguntas cortas y te mostramos dónde está tu equipo hoy y qué es lo primero que lo movería.
        </p>
        <div style={{ display: "grid", gap: 14 }}>
          {Object.entries(SLUG_POR_AREA).map(([area, slug]) => (
            <Link
              key={area}
              href={`/external/test/${slug}${sufijo(pasa)}`}
              style={{ display: "block", padding: "18px 20px", borderRadius: 14, border: "1px solid #dfe5f1", background: "#fff", color: "#0f1b3d", textDecoration: "none" }}
            >
              <span style={{ display: "block", fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{NOMBRE_DEL_AREA[area]}</span>
              <span style={{ display: "block", fontSize: 14, color: "#5b6a8a", lineHeight: 1.5 }}>{QUE_MIDE[area]}</span>
            </Link>
          ))}
        </div>
      </div>
    </ExternalShell>
  );
}
