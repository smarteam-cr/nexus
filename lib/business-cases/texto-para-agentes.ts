/**
 * lib/business-cases/texto-para-agentes.ts — una PROPUESTA COMERCIAL (caso de negocio publicado) como texto para el
 * handoff (2026-11-18). PURO.
 *
 * Caso RC Inmobiliaria · DocuSign: el desglose de lo vendido («≈ 40 horas de DocuSign dentro de las 20 horas mensuales
 * del Acuerdo Macro») estaba SOLO en el caso de negocio publicado. El handoff leía los tratos de HubSpot (monto y
 * productos) pero no la propuesta, y tomó como «lo vendido» un trato de junio que el acuerdo de octubre había absorbido.
 *
 * Se lee la FOTO PUBLICADA (`publishedSnapshot`: lo que vio el cliente), sección por sección, sin el HTML ni los estilos.
 * Una propuesta sin publicar no entra: no es lo que se le vendió al cliente.
 */

const esObjeto = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/** Lo que no es contenido: imágenes, enlaces, temas y marcas de formato. */
const CLAVES_SIN_TEXTO = /url$|^(theme|brands|icon|imagen|image|color|backdrop|blockType|anchoRecurrente|moneda)$/i;

/** El texto visible de un HTML: sin <head>, <style> ni <script>, sin etiquetas y con los espacios juntos. */
export function textoDeHtml(html: string): string {
  return html
    .replace(/<(head|style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** Los textos de un dato de bloque, en orden, sin lo que no es contenido. */
function textosDe(v: unknown, clave = "", out: string[] = []): string[] {
  if (typeof v === "string") {
    const t = v.trim();
    if (!t || /^https?:\/\//.test(t)) return out;
    out.push(clave === "html" ? textoDeHtml(t) : t);
  } else if (typeof v === "number" && clave) {
    out.push(`${clave}: ${v}`);
  } else if (Array.isArray(v)) {
    for (const x of v) textosDe(x, clave, out);
  } else if (esObjeto(v)) {
    for (const [k, x] of Object.entries(v)) {
      if (CLAVES_SIN_TEXTO.test(k)) continue;
      textosDe(x, k, out);
    }
  }
  return out;
}

export const MAX_LARGO_DE_UNA_PROPUESTA = 10_000;

/**
 * ⭐ El texto de una propuesta publicada: el nombre, el trato y cada sección con su título y su contenido. "" si la foto
 * no tiene secciones legibles.
 */
export function textoDeLaPropuestaParaElHandoff(i: {
  nombre: string;
  trato: string | null;
  publishedSnapshot: unknown;
  max?: number;
}): string {
  const snap = esObjeto(i.publishedSnapshot) ? i.publishedSnapshot : null;
  const secciones = snap && Array.isArray(snap.sections) ? snap.sections : [];
  const partes: string[] = [];
  for (const s of secciones) {
    if (!esObjeto(s)) continue;
    const titulo = typeof s.titleOverride === "string" && s.titleOverride.trim() ? s.titleOverride : typeof s.label === "string" ? s.label : "";
    const bloques = Array.isArray(s.blocks) ? s.blocks : [];
    const texto = bloques
      .flatMap((b) => (esObjeto(b) ? [...textosDe(b.data), ...(typeof b.content === "string" ? [b.content.trim()] : [])] : []))
      .filter(Boolean)
      .join("\n");
    if (texto) partes.push(`### ${titulo || "Sección"}\n${texto}`);
  }
  if (partes.length === 0) return "";
  const max = i.max ?? MAX_LARGO_DE_UNA_PROPUESTA;
  const cuerpo = partes.join("\n\n");
  const recortado = cuerpo.length > max ? `${cuerpo.slice(0, max).trimEnd()}\n[… la propuesta sigue; se cortó acá]` : cuerpo;
  return `## Propuesta «${i.nombre}»${i.trato ? ` (trato «${i.trato}»)` : ""}\n${recortado}`;
}
