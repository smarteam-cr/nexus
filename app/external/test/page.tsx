/**
 * /external/test — ELEGIR EL ÁREA Y LA INDUSTRIA del test del diagnóstico de rendimiento (O6, 2026-10-26; la industria al
 * inicio, 2026-10-27).
 *
 * La aplicación vieja tenía una sola entrada (`dev.smarteamcr.com/diagnostico-rendimiento/`) y el área se elegía
 * adentro; en Nexus cada área tiene su página. Esta es la entrada única para el día del corte: nginx manda la dirección
 * vieja acá y los enlaces que ya circulan no se rompen. Pasa a la página del área lo que mide la campaña (utm, gclid,
 * fbclid) y `v=marketing`, para que la atribución de anuncios no se pierda en el salto. Con `?area=ventas` (la página
 * vieja la recibía de otros formularios, junto con el correo y el nombre de la persona) va directo a esa área; los datos
 * de la persona NO se pasan: la dirección queda en los registros de nginx y en la historia del navegador.
 *
 * La INDUSTRIA se elige acá, con el área, antes de nada (Elías, 27 oct): decide la edición de las preguntas, y así la
 * página del área ya abre con el banco de esa edición (cuántas preguntas, sus palabras). Es un formulario GET sin JS: el
 * servidor recibe `?area=…&industria=…` y redirige al área con la industria. Si llega solo el área (un enlace viejo), la
 * página del área pregunta la industria antes del formulario.
 *
 * Página del cliente (§1-WEB): tema claro con hex literal, tuteo. Carga los píxeles de anuncios como la del área.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ExternalShell from "@/components/external/ExternalShell";
import PixelesDelTest from "@/components/external/test/PixelesDelTest";
import SelectorDeIndustria from "@/components/external/test/SelectorDeIndustria";
import { getBrandLogos } from "@/lib/external/smarteam-logo";
import { consultaConIndustria, sufijo, type Consulta } from "@/lib/tests-diagnostico/direccion-publica";
import { pixelesDelTest } from "@/lib/tests-diagnostico/pixeles";
import { AREA_POR_SLUG, NOMBRE_DEL_AREA, SLUG_POR_AREA } from "@/lib/tests-diagnostico/tipos";

const TINTA = "#0f1b3d";
const TINTA_SUAVE = "#5b6a8a";
const BORDE = "#dfe5f1";
const ACENTO = "#E8481C";
const ROYAL = "#0B58D3";

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

// La tarjeta elegida se marca sin JS (`:has(:checked)`); el foco del teclado se ve en la tarjeta entera.
const ESTILO = `
.t-area { display: block; padding: 18px 20px; border-radius: 14px; border: 2px solid ${BORDE}; background: #fff; cursor: pointer; }
.t-area:has(input:checked) { border-color: ${ROYAL}; background: #eef4ff; }
.t-area:has(input:focus-visible) { outline: 3px solid ${ROYAL}; outline-offset: 2px; }
.t-area input { position: absolute; opacity: 0; width: 1px; height: 1px; }
`;

export default async function ElegirElArea({ searchParams }: { searchParams: Promise<Consulta> }) {
  const [q, logos] = await Promise.all([searchParams, getBrandLogos()]);
  // Lo que pasa al área: lo que mide la campaña, la versión y la industria (lib/tests-diagnostico/direccion-publica.ts).
  const { pasa, industria } = consultaConIndustria(q);
  const area = (Array.isArray(q.area) ? q.area[0] : q.area)?.trim().toLowerCase();
  if (area && Object.hasOwn(AREA_POR_SLUG, area)) redirect(`/external/test/${area}${sufijo(pasa)}`);
  // Con el correo o el nombre en la dirección (o un área que no existe), primero se limpia: esta página carga píxeles.
  if (!consultaConIndustria(q).limpia) redirect(`/external/test${sufijo(pasa)}`);
  // Lo que viaja escondido en el formulario: lo de campaña y la versión (la industria es un campo del formulario).
  const escondidos = [...pasa.entries()].filter(([k]) => k !== "industria");
  return (
    <ExternalShell smarteamLogoUrl={logos.smarteam}>
      <PixelesDelTest pixeles={pixelesDelTest(process.env)} />
      <style>{ESTILO}</style>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "56px 20px 72px", fontFamily: "var(--font-jakarta), system-ui, sans-serif", color: TINTA }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: ACENTO }}>Diagnóstico de Rendimiento</p>
        <h1 style={{ fontSize: 30, lineHeight: 1.2, margin: "8px 0 10px" }}>¿Qué área quieres medir?</h1>
        <p style={{ fontSize: 16, color: TINTA_SUAVE, lineHeight: 1.6, margin: "0 0 28px" }}>
          Respondes unas preguntas cortas y te mostramos dónde está tu equipo hoy y qué es lo primero que lo movería.
        </p>
        <form method="get" action="/external/test" style={{ display: "grid", gap: 24 }}>
          {escondidos.map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <fieldset style={{ border: "none", margin: 0, padding: 0, display: "grid", gap: 14 }}>
            <legend style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>1. El área</legend>
            {Object.entries(SLUG_POR_AREA).map(([id, slug], i) => (
              <label key={id} className="t-area">
                <input type="radio" name="area" value={slug} required={i === 0} />
                <span style={{ display: "block", fontSize: 18, fontWeight: 700, marginBottom: 4, color: TINTA }}>{NOMBRE_DEL_AREA[id]}</span>
                <span style={{ display: "block", fontSize: 14, color: TINTA_SUAVE, lineHeight: 1.5 }}>{QUE_MIDE[id]}</span>
              </label>
            ))}
          </fieldset>
          <div>
            <label htmlFor="t-industria" style={{ display: "block", fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
              2. La industria de tu empresa
            </label>
            <p style={{ margin: "0 0 10px", fontSize: 14, color: TINTA_SUAVE, lineHeight: 1.5 }}>Con ella te hacemos las preguntas con las palabras de tu sector.</p>
            <SelectorDeIndustria id="t-industria" valor={industria} />
          </div>
          <div>
            <button type="submit" style={{ padding: "12px 22px", borderRadius: 10, border: "none", background: ACENTO, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
              Empezar
            </button>
          </div>
        </form>
      </div>
    </ExternalShell>
  );
}
