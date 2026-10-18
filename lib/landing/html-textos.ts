/**
 * lib/landing/html-textos.ts — LOS TEXTOS DE UN HTML PEGADO, PARA CAMBIARLOS SIN TOCAR EL DISEÑO.
 *
 * PURO. Sin DOM, sin React: corre igual en el servidor (la ruta que adapta) y en el navegador
 * (el editor que aplica lo aprobado).
 *
 * ── PARA QUÉ ──────────────────────────────────────────────────────────────────────────────────
 * «Adaptar a esta empresa» le pide a la IA que cambie los textos de un módulo armado para otro
 * cliente. Si la IA devolviera el HTML entero, podría cambiar una clase, un color o una línea del
 * script sin que nadie lo note, y el módulo dejaría de funcionar en silencio. Acá el HTML se parte
 * en SEGMENTOS de texto con su posición exacta; la IA solo ve y devuelve segmentos, y el HTML se
 * rearma reemplazando únicamente esos rangos. Las etiquetas, el CSS y el código no pueden cambiar:
 * no le llegan.
 *
 * ── QUÉ ES UN TEXTO ───────────────────────────────────────────────────────────────────────────
 *   · el texto entre etiquetas (fuera de <style>, de los comentarios y del código);
 *   · los atributos que se leen: alt, title, placeholder, aria-label;
 *   · ⭐ las cadenas del <script> que parecen prosa. Medido sobre las 66 secciones de Ventas: los
 *     tabs y las tarjetas se arman casi siempre desde un objeto `CONFIG` en JavaScript, así que sin
 *     esto «Adaptar» dejaba intacto justo lo que más nombra al cliente anterior.
 *
 * ⚠ Una cadena con `<` o con `${` NO se toca: es HTML armado por el script, o una plantilla con
 * código adentro. Reemplazarla podría romper el script; se deja como está.
 */

export type DondeDelTexto = "texto" | "atributo" | "script";

export interface SegmentoDeTexto {
  id: number;
  /** El texto ya decodificado (sin entidades ni escapes), como lo lee una persona. */
  texto: string;
  donde: DondeDelTexto;
  /** El rango CRUDO en el HTML que se reemplaza: [inicio, fin). */
  inicio: number;
  fin: number;
  /** La comilla que lo encierra, para volver a escapar (atributos y cadenas del script). */
  comilla?: '"' | "'" | "`";
}

/** Tope de segmentos: un HTML de 200.000 caracteres puede tener miles, y el pedido tiene que entrar. */
export const MAX_SEGMENTOS = 600;

const ATRIBUTOS_LEGIBLES = new Set(["alt", "title", "placeholder", "aria-label"]);

const ENTIDADES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

/** Decodifica las entidades que aparecen en texto escrito a mano. Lo desconocido queda tal cual. */
export function decodificarEntidades(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k.startsWith("#x")) return String.fromCodePoint(parseInt(k.slice(2), 16));
    if (k.startsWith("#")) return String.fromCodePoint(parseInt(k.slice(1), 10));
    return ENTIDADES[k] ?? m;
  });
}

function escaparTexto(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escaparAtributo(s: string, comilla: '"' | "'"): string {
  const base = escaparTexto(s);
  return comilla === '"' ? base.replace(/"/g, "&quot;") : base.replace(/'/g, "&#39;");
}

function decodificarJs(s: string): string {
  return s.replace(/\\(u\{[0-9a-f]+\}|u[0-9a-f]{4}|x[0-9a-f]{2}|[\s\S])/gi, (_m, e: string) => {
    if (e[0] === "u" && e[1] === "{") return String.fromCodePoint(parseInt(e.slice(2, -1), 16));
    if ((e[0] === "u" || e[0] === "x") && e.length > 1) return String.fromCodePoint(parseInt(e.slice(1), 16));
    if (e === "n") return "\n";
    if (e === "t") return "\t";
    if (e === "r") return "\r";
    if (e === "\n") return ""; // continuación de línea
    return e;
  });
}

function escaparJs(s: string, comilla: '"' | "'" | "`"): string {
  let out = s.replace(/\\/g, "\\\\").replace(/\r/g, "\\r").replace(/\n/g, "\\n");
  out = out.split(comilla).join(`\\${comilla}`);
  if (comilla === "`") out = out.replace(/\$\{/g, "\\${");
  // Un `</script` adentro de una cadena cierra el bloque para el navegador.
  return out.replace(/<\/script/gi, "<\\/script");
}

/**
 * ¿Una cadena del script es prosa que lee una persona?
 *
 * Dos palabras de al menos dos letras separadas por espacio, o una sola palabra que empieza en
 * mayúscula (el rótulo de una pestaña: «Comercial»). Se descartan rutas, URLs y lo que tiene `<`
 * o `${`. Una lista de clases CSS puede pasar el filtro: la IA la deja igual, y una persona revisa
 * cada cambio antes de aplicarlo.
 */
export function pareceProsa(s: string): boolean {
  const v = s.trim();
  if (v.length < 2 || v.length > 2000) return false;
  if (/[<]|\$\{/.test(v)) return false;
  if (/:\/\/|^\/|\.(png|jpe?g|svg|webp|gif|css|js|json)\b/i.test(v)) return false;
  // Un selector («.tabs button», «#panel», «[data-x]») es código, aunque tenga dos palabras.
  if (/^[.#[]/.test(v)) return false;
  if (/\p{L}{2,}\s+\p{L}{2,}/u.test(v)) return true;
  // Una sola palabra: mayúscula y después solo minúsculas. Así «IntersectionObserver» o
  // «DOMContentLoaded» (nombres de la API del navegador) no se confunden con un rótulo.
  return /^\p{Lu}\p{Ll}{2,}[.:!?]?$/u.test(v);
}

/** Lee el contenido de un <script> y devuelve las cadenas que parecen prosa, con su rango crudo. */
function cadenasDelScript(html: string, desde: number, hasta: number, out: Omit<SegmentoDeTexto, "id">[]) {
  let i = desde;
  while (i < hasta) {
    const c = html[i];
    const d = html[i + 1];
    if (c === "/" && d === "/") {
      const nl = html.indexOf("\n", i);
      i = nl === -1 || nl > hasta ? hasta : nl + 1;
      continue;
    }
    if (c === "/" && d === "*") {
      const fin = html.indexOf("*/", i + 2);
      i = fin === -1 || fin > hasta ? hasta : fin + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const comilla = c as '"' | "'" | "`";
      let j = i + 1;
      let conCodigo = false;
      let profundidad = 0;
      while (j < hasta) {
        const x = html[j];
        if (x === "\\") {
          j += 2;
          continue;
        }
        if (comilla === "`" && x === "$" && html[j + 1] === "{") {
          conCodigo = true;
          profundidad++;
          j += 2;
          continue;
        }
        if (comilla === "`" && profundidad > 0 && x === "}") {
          profundidad--;
          j++;
          continue;
        }
        if (x === comilla && profundidad === 0) break;
        // Una cadena de comilla simple o doble no cruza la línea: si la cruza, era otra cosa
        // (una expresión regular, una división) y se deja de leer como cadena.
        if (comilla !== "`" && x === "\n") break;
        j++;
      }
      if (j >= hasta || html[j] !== comilla) {
        i = j + 1;
        continue;
      }
      const crudo = html.slice(i + 1, j);
      if (!conCodigo) {
        const texto = decodificarJs(crudo);
        if (pareceProsa(texto)) out.push({ texto, donde: "script", inicio: i + 1, fin: j, comilla });
      }
      i = j + 1;
      continue;
    }
    i++;
  }
}

/** Un texto entre etiquetas: se guarda sin los espacios de alrededor, que son del maquetado. */
function textoEntreEtiquetas(html: string, desde: number, hasta: number, out: Omit<SegmentoDeTexto, "id">[]) {
  const crudo = html.slice(desde, hasta);
  if (!/\p{L}/u.test(crudo)) return;
  const izq = crudo.length - crudo.trimStart().length;
  const der = crudo.length - crudo.trimEnd().length;
  const inicio = desde + izq;
  const fin = hasta - der;
  if (fin <= inicio) return;
  out.push({ texto: decodificarEntidades(html.slice(inicio, fin)), donde: "texto", inicio, fin });
}

function atributosLegibles(html: string, desde: number, hasta: number, out: Omit<SegmentoDeTexto, "id">[]) {
  const re = /([^\s=/>"']+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  const tag = html.slice(desde, hasta);
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) {
    if (!ATRIBUTOS_LEGIBLES.has(m[1].toLowerCase())) continue;
    const comilla = m[2][0] as '"' | "'";
    const valor = m[3] ?? m[4] ?? "";
    if (!/\p{L}/u.test(valor)) continue;
    const inicio = desde + m.index + m[0].length - valor.length - 1;
    out.push({ texto: decodificarEntidades(valor), donde: "atributo", inicio, fin: inicio + valor.length, comilla });
  }
}

/** Dónde termina una etiqueta que abre en `i`, respetando las comillas de sus atributos. */
function finDeEtiqueta(html: string, i: number): number {
  let comilla: string | null = null;
  for (let j = i + 1; j < html.length; j++) {
    const c = html[j];
    if (comilla) {
      if (c === comilla) comilla = null;
    } else if (c === '"' || c === "'") {
      comilla = c;
    } else if (c === ">") {
      return j;
    }
  }
  return html.length - 1;
}

/** Los textos de un HTML, en orden de aparición. Ver el encabezado. */
export function extraerTextos(html: string): SegmentoDeTexto[] {
  const out: Omit<SegmentoDeTexto, "id">[] = [];
  const s = typeof html === "string" ? html : "";
  let i = 0;
  let textoDesde = 0;
  while (i < s.length) {
    if (s[i] !== "<") {
      i++;
      continue;
    }
    // Un `<` que no abre una etiqueta (un «a < b» suelto) es texto.
    const sig = s[i + 1] ?? "";
    if (!/[a-zA-Z/!]/.test(sig)) {
      i++;
      continue;
    }
    textoEntreEtiquetas(s, textoDesde, i, out);
    if (s.startsWith("<!--", i)) {
      const fin = s.indexOf("-->", i + 4);
      i = fin === -1 ? s.length : fin + 3;
      textoDesde = i;
      continue;
    }
    const fin = finDeEtiqueta(s, i);
    const nombre = (/^<\s*([a-zA-Z][\w-]*)/.exec(s.slice(i, fin + 1))?.[1] ?? "").toLowerCase();
    atributosLegibles(s, i, fin + 1, out);
    i = fin + 1;
    if (nombre === "script" || nombre === "style") {
      const cierre = s.toLowerCase().indexOf(`</${nombre}`, i);
      const hasta = cierre === -1 ? s.length : cierre;
      if (nombre === "script") cadenasDelScript(s, i, hasta, out);
      i = hasta;
    }
    textoDesde = i;
  }
  textoEntreEtiquetas(s, textoDesde, s.length, out);
  return out
    .sort((a, b) => a.inicio - b.inicio)
    .slice(0, MAX_SEGMENTOS)
    .map((seg, id) => ({ ...seg, id }));
}

/**
 * Rearma el HTML con los textos cambiados. Solo toca los rangos de los segmentos cuyo id viene en
 * `cambios`; lo demás queda byte por byte igual.
 *
 * ⚠ Se reemplaza de atrás para adelante: así los rangos de los segmentos anteriores no se corren.
 */
export function aplicarTextos(
  html: string,
  segmentos: readonly SegmentoDeTexto[],
  cambios: ReadonlyMap<number, string> | Record<number, string>,
): string {
  const get = (id: number): string | undefined =>
    cambios instanceof Map ? cambios.get(id) : (cambios as Record<number, string>)[id];
  let out = html;
  const orden = [...segmentos].sort((a, b) => b.inicio - a.inicio);
  for (const seg of orden) {
    const nuevo = get(seg.id);
    if (typeof nuevo !== "string" || nuevo === seg.texto) continue;
    const crudo =
      seg.donde === "script"
        ? escaparJs(nuevo, seg.comilla ?? '"')
        : seg.donde === "atributo"
          ? escaparAtributo(nuevo, seg.comilla === "'" ? "'" : '"')
          : escaparTexto(nuevo);
    out = out.slice(0, seg.inicio) + crudo + out.slice(seg.fin);
  }
  return out;
}

/**
 * Una huella corta del HTML (djb2), para saber si lo que se propuso adaptar es lo que hay hoy.
 * Los rangos de los segmentos solo valen sobre EL MISMO texto: aplicarlos sobre un HTML que
 * alguien cambió en el medio cortaría etiquetas por la mitad.
 */
export function huellaDelHtml(html: string): string {
  let h = 5381;
  for (let i = 0; i < html.length; i++) h = ((h << 5) + h + html.charCodeAt(i)) | 0;
  return `${html.length}:${(h >>> 0).toString(36)}`;
}
