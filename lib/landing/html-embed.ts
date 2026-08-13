/**
 * lib/landing/html-embed.ts — la CSP que se le inyecta al HTML pegado por Ventas.
 *
 * ── QUÉ PROTEGE Y QUÉ NO (leer antes de tocar la política) ───────────────────
 * La barrera REAL del embebido es el sandbox del iframe: `sandbox="allow-scripts"` SIN
 * `allow-same-origin` le da un origen opaco, así que su JS no ve cookies (ni la
 * `nexus_bc_access` httpOnly del cliente externo), ni localStorage, ni el DOM de Nexus.
 * Las dos banderas juntas se anulan entre sí —el frame sería same-origin Y ejecutaría
 * scripts, o sea que podría quitarse el sandbox solo— y por eso nunca conviven.
 *
 * Esta CSP es la SEGUNDA red, y hace falta porque en el repo no hay ninguna otra:
 * `next.config.ts` no declara `headers()` y `middleware.ts` no setea CSP en ninguna capa.
 * Lo que agrega, concretamente:
 *   · `connect-src 'none'` — nada de fetch/XHR/sendBeacon/WebSocket desde el embebido.
 *   · `form-action 'none'` — un formulario pegado por error (o copiado de otro sitio) no
 *     puede enviarse. En la página del prospecto eso sería phishing bajo nuestro dominio.
 *   · `base-uri 'none'` / `frame-src 'none'` — sin reescribir URLs relativas ni anidar.
 *
 * Lo que NO cierra, dicho de frente: `img-src https:` sigue permitiendo un beacon con
 * `new Image().src = "https://…"`. Se deja a propósito —una animación con un logo de CDN
 * es el caso normal— y el riesgo es aceptable porque adentro del origen opaco no hay nada
 * que valga la pena exfiltrar: el único dato del frame es el HTML que Ventas pegó.
 *
 * Contrapartida asumida: un embebido que legítimamente consulte una API en vivo NO
 * funciona. El arreglo correcto sería un permiso por sección, no aflojar el default.
 */

/** Los CDN quedan habilitados (Tailwind, GSAP): sin eso el 90% de lo que Ventas va a
 *  pegar no arranca, y el objetivo nunca fue impedir que el HTML corra. */
export const EMBED_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' https: data:",
  "style-src 'unsafe-inline' https:",
  "img-src data: blob: https:",
  "font-src data: https:",
  "media-src data: blob: https:",
  "connect-src 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
].join("; ");

const META = `<meta http-equiv="Content-Security-Policy" content="${EMBED_CSP}">`;

/** Primera etiqueta de apertura que matchee, con su posición final. */
function finDeTag(html: string, re: RegExp): number | null {
  const m = re.exec(html);
  return m ? m.index + m[0].length : null;
}

/**
 * Inserta la CSP lo más temprano posible del documento, PERO nunca antes de un
 * `<!DOCTYPE>` — meter cualquier cosa delante del doctype tira al navegador a quirks mode
 * y la animación se vería distinta que en la máquina de Ventas.
 *
 * El orden de preferencia es el del parser: si hay `<head>`, adentro; si no, después de
 * `<html>` o del doctype (el parser crea el head y hoistea el meta); y un fragmento suelto
 * lo recibe al principio.
 */
export function withEmbedCsp(html: string): string {
  const src = html ?? "";
  if (!src.trim()) return src;
  const pos =
    finDeTag(src, /<head\b[^>]*>/i) ??
    finDeTag(src, /<html\b[^>]*>/i) ??
    finDeTag(src, /<!doctype\b[^>]*>/i) ??
    0;
  return src.slice(0, pos) + META + src.slice(pos);
}
