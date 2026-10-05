/**
 * lib/marketing/idea-sem.ts — separa la descripción de una idea de SEM en los campos que se leen.
 *
 * El agente devuelve UN párrafo («Objetivo: … Audiencia: … Ángulo/mensaje: … Keywords sugeridas: …»). La pantalla
 * los muestra por separado (rediseño de Marketing, 2026-10-04). Medido ese día sobre las 56 ideas guardadas: usa
 * ~20 rótulos distintos para 6 cosas («Audiencia ICP», «Ángulo del anuncio», «Formato recomendado», «CTA»…), así
 * que se reconoce una LISTA CERRADA de rótulos y cada uno cae en su campo. Un «Algo:» que no está en la lista
 * («El tono es consultivo: …») sigue siendo texto del campo anterior: es una frase con dos puntos, no un rótulo.
 *
 * Sin ningún rótulo reconocido, la descripción entera queda en un solo campo («Descripción»): nunca se pierde texto.
 * Puro y client-safe.
 */

export type CampoIdeaSem = "intro" | "objetivo" | "audiencia" | "angulo" | "keywords" | "formato" | "cta";

export interface SeccionIdeaSem {
  campo: CampoIdeaSem;
  rotulo: string;
  texto: string;
  /** Solo en `keywords`: cada búsqueda por separado. */
  keywords?: string[];
}

/** Rótulo del agente → campo. El orden importa: el más largo primero, así «Ángulo del mensaje» gana a «Ángulo». */
const ROTULOS: Array<[string, CampoIdeaSem]> = [
  ["Objetivo de campaña", "objetivo"],
  ["Objetivo", "objetivo"],
  ["Audiencia ICP", "audiencia"],
  ["Audiencia", "audiencia"],
  ["Segmentación", "audiencia"],
  ["Sectores", "audiencia"],
  ["Ángulo del mensaje", "angulo"],
  ["Ángulo del anuncio", "angulo"],
  ["Ángulo/mensaje", "angulo"],
  ["Ángulo", "angulo"],
  ["Keywords sugeridas", "keywords"],
  ["Keywords", "keywords"],
  ["Creatividad sugerida", "formato"],
  ["Creatividades", "formato"],
  ["Formato recomendado", "formato"],
  ["Formato sugerido", "formato"],
  ["Formato", "formato"],
  ["Plataforma principal", "formato"],
  ["Plataforma", "formato"],
  ["Landing page", "cta"],
  ["Oferta", "cta"],
  ["CTA", "cta"],
];

const ETIQUETA: Record<CampoIdeaSem, string> = {
  intro: "Descripción",
  objetivo: "Objetivo",
  audiencia: "Audiencia",
  angulo: "Ángulo",
  keywords: "Keywords",
  formato: "Formato y creatividad",
  cta: "Llamado a la acción",
};

/** Orden en que se muestran, sin importar el orden en que los escribió el agente. */
const ORDEN: CampoIdeaSem[] = ["intro", "objetivo", "audiencia", "angulo", "keywords", "formato", "cta"];

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/**
 * Un rótulo vale solo al principio o después del cierre de otra frase (punto, comilla, paréntesis o salto de línea):
 * así «la Audiencia: …» en medio de una oración no parte el texto.
 */
const RE_ROTULO = new RegExp(
  `(^|[.\\n'"»)\\]]\\s*|\\n\\s*)(${ROTULOS.map(([r]) => escapar(r)).join("|")})\\s*:`,
  "g",
);

/** Las búsquedas sugeridas: entre comillas si las trae; si no, separadas por comas. */
export function keywordsDe(texto: string): string[] {
  const entreComillas = [...texto.matchAll(/['"«“‘]([^'"»”’]{2,120})['"»”’]/g)].map((m) => m[1].trim());
  const crudas = entreComillas.length > 0 ? entreComillas : texto.split(/[,;]/);
  const vistas = new Set<string>();
  const out: string[] = [];
  for (const k of crudas) {
    const limpia = k.replace(/[.\s]+$/g, "").trim();
    if (limpia.length < 2 || vistas.has(limpia.toLowerCase())) continue;
    vistas.add(limpia.toLowerCase());
    out.push(limpia);
  }
  return out;
}

const limpiar = (s: string) => s.replace(/\s+/g, " ").replace(/^[\s—–-]+|[\s—–-]+$/g, "").trim();

/** Para leer: comillas simples del agente → latinas, y la primera letra en mayúscula («generar…» → «Generar…»). */
function paraLeer(s: string): string {
  const conComillas = s.replace(/'([^']{2,}?)'/g, "«$1»");
  return conComillas.charAt(0).toUpperCase() + conComillas.slice(1);
}

export function seccionesDeIdeaSem(descripcion: string): SeccionIdeaSem[] {
  const texto = descripcion.trim();
  if (!texto) return [];
  const campoDe = new Map(ROTULOS.map(([r, c]) => [r, c] as const));
  const cortes: Array<{ campo: CampoIdeaSem; desde: number; inicioRotulo: number }> = [];
  for (const m of texto.matchAll(RE_ROTULO)) {
    const inicioRotulo = (m.index ?? 0) + m[1].length;
    cortes.push({ campo: campoDe.get(m[2])!, desde: (m.index ?? 0) + m[0].length, inicioRotulo });
  }
  if (cortes.length === 0) return [{ campo: "intro", rotulo: ETIQUETA.intro, texto: paraLeer(limpiar(texto)) }];

  const juntos = new Map<CampoIdeaSem, string[]>();
  const sumar = (campo: CampoIdeaSem, t: string) => {
    const l = limpiar(t);
    if (!l) return;
    juntos.set(campo, [...(juntos.get(campo) ?? []), l]);
  };
  sumar("intro", texto.slice(0, cortes[0].inicioRotulo));
  cortes.forEach((c, i) => sumar(c.campo, texto.slice(c.desde, i + 1 < cortes.length ? cortes[i + 1].inicioRotulo : texto.length)));

  return ORDEN.filter((c) => juntos.has(c)).map((campo) => {
    const t = juntos.get(campo)!.join(" ");
    return campo === "keywords"
      ? { campo, rotulo: ETIQUETA.keywords, texto: t, keywords: keywordsDe(t) }
      : { campo, rotulo: ETIQUETA[campo], texto: paraLeer(t) };
  });
}
