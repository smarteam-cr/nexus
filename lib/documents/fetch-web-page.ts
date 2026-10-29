/**
 * lib/documents/fetch-web-page.ts
 *
 * Descarga una página web pública y extrae su texto legible. Sirve para leer
 * propuestas comerciales que viven como URL web (no como archivo ni Google Doc).
 *
 * Seguridad (SSRF): este helper pide desde el servidor una URL que pega una
 * persona. Aunque el endpoint es interno (solo el equipo, autenticado), el
 * servidor no puede servir de puente a lo que solo se ve desde adentro (la
 * propia app, la base, los metadatos de la nube). El pedido va por
 * lib/net/pedido-publico.ts, el mismo que lee el sitio de una empresa en las
 * exploraciones de venta:
 *   - solo http(s), sin usuario, contraseña ni puerto, y con un nombre de
 *     dominio (nada de IPs escritas ni `localhost`);
 *   - antes de CADA pedido se resuelve el DNS y se rechaza si alguna IP es
 *     interna (privada, loopback, CGNAT, link-local, metadatos, multicast, IPv4
 *     dentro de IPv6), y la conexión va a esa misma IP, sin volver a preguntarle
 *     al DNS (así no pasa un DNS rebinding);
 *   - las redirecciones se siguen a mano, hasta 5, y cada destino pasa por la
 *     misma validación (acá sí pueden cambiar de dominio: un acortador lleva a
 *     otro sitio);
 *   - 15 segundos para todo el pedido y 5 MB como máximo, leídos con tope.
 *
 * Limitaciones conocidas:
 *   - Páginas SPA (Notion, Pitch, Canva, etc. que renderizan con JS) pueden
 *     devolver HTML casi vacío — el texto vive en JS, no en el HTML inicial.
 *     Es "best effort": si el HTML trae texto, lo extrae; si no, content corto.
 */

import { extractText, MAX_EXTRACTED_CHARS } from "@/lib/documents/extract-text";
import { leerCuerpoHasta, PedidoRechazado, pedirUrlPublica, type MotivoPedidoRechazado } from "@/lib/net/pedido-publico";

export type WebFetchErrorCode = "INVALID_URL" | "BLOCKED" | "FETCH_FAILED" | "TOO_LARGE" | "EMPTY";

export class WebFetchError extends Error {
  code: WebFetchErrorCode;
  constructor(code: WebFetchErrorCode, message: string) {
    super(message);
    this.name = "WebFetchError";
    this.code = code;
  }
}

export interface FetchedWebPage {
  title: string;
  content: string | null;
}

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 5 * 1024 * 1024; // 5MB de HTML
const MAX_REDIRECCIONES = 5;

/** Lo que se le dice a la persona cuando un salto se rechaza, en la URL que pegó o en una redirección. */
export function errorDelRechazo(motivo: MotivoPedidoRechazado, enRedireccion: boolean): WebFetchError {
  const sujeto = enRedireccion ? "La página redirige a una dirección" : "La URL apunta a una dirección";
  switch (motivo) {
    case "PROTOCOLO":
      return enRedireccion
        ? new WebFetchError("BLOCKED", "La página redirige a una dirección que no es http(s).")
        : new WebFetchError("INVALID_URL", "Solo se admiten URLs http(s).");
    case "CREDENCIALES":
      return enRedireccion
        ? new WebFetchError("BLOCKED", "La página redirige a una dirección con usuario y contraseña.")
        : new WebFetchError("INVALID_URL", "La URL no puede llevar usuario ni contraseña.");
    case "PUERTO":
      return new WebFetchError("BLOCKED", `${sujeto} con un puerto propio, y esas no se leen.`);
    case "HOST":
      return new WebFetchError(
        "BLOCKED",
        `${sujeto} que no es un dominio público (una IP escrita, localhost o una red local).` +
          (enRedireccion ? "" : " Usa la URL con su dominio."),
      );
    case "IP_INTERNA":
      return new WebFetchError("BLOCKED", `${sujeto} de una red interna, y esas no se leen.`);
    case "SIN_DNS":
      return new WebFetchError(
        "FETCH_FAILED",
        enRedireccion ? "La página redirige a un dominio que no existe." : "No se encontró el dominio de la página. Revisa la URL.",
      );
    case "REDIRECCION":
      return new WebFetchError("FETCH_FAILED", "La página redirige a una dirección que no se puede seguir.");
    case "DEMASIADAS_REDIRECCIONES":
      return new WebFetchError("FETCH_FAILED", "La página redirige demasiadas veces.");
  }
}

function esCorte(err: unknown): boolean {
  return err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
}

const tardoDemasiado = () => new WebFetchError("FETCH_FAILED", "La página tardó demasiado en responder.");

/* Con un agente propio, los sitios en HubSpot CMS y detrás de Cloudflare responden 403 (probado el
   2026-10-01 con smarteamcr.com y hubspot.com): se pide como un navegador común. Otros rechazan
   justo eso (w3.org, probado el 2026-10-29): ante un 403 se vuelve a pedir con el agente propio. */
const AGENTE_NAVEGADOR = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const AGENTE_PROPIO = "NexusBot/1.0 (+document-reader; internal use)";

function pedirComo(url: URL, agente: string, signal: AbortSignal) {
  return pedirUrlPublica(url, {
    maxRedirecciones: MAX_REDIRECCIONES,
    signal,
    headers: {
      "User-Agent": agente,
      Accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
      "Accept-Language": "es-CR,es;q=0.9,en;q=0.8",
    },
  });
}

/**
 * Extrae el <title> del HTML como nombre del documento. Fallback al hostname.
 */
function extractHtmlTitle(html: string, url: URL): string {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const t = m?.[1]?.trim();
  if (t) return t.slice(0, 200);
  return url.hostname;
}

/**
 * Descarga la página y devuelve { title, content }. Lanza WebFetchError en fallos.
 */
export async function fetchWebPage(rawUrl: string): Promise<FetchedWebPage> {
  let inicial: URL;
  try {
    inicial = new URL(rawUrl);
  } catch {
    throw new WebFetchError("INVALID_URL", "La URL no es válida.");
  }

  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  let res: Response;
  let url: URL;
  try {
    ({ res, url } = await pedirComo(inicial, AGENTE_NAVEGADOR, signal));
    if (res.status === 403) {
      await res.body?.cancel().catch(() => {});
      ({ res, url } = await pedirComo(inicial, AGENTE_PROPIO, signal));
    }
  } catch (err) {
    if (err instanceof PedidoRechazado) throw errorDelRechazo(err.motivo, err.salto > 0);
    if (signal.aborted || esCorte(err)) throw tardoDemasiado();
    throw new WebFetchError("FETCH_FAILED", "No se pudo acceder a la página.");
  }

  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new WebFetchError("FETCH_FAILED", `La página respondió con estado ${res.status}.`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  const esPdf = contentType.includes("application/pdf");
  const declarado = Number(res.headers.get("content-length"));
  if (Number.isFinite(declarado) && declarado > MAX_BYTES) {
    await res.body?.cancel().catch(() => {});
    throw new WebFetchError("TOO_LARGE", esPdf ? "El archivo es demasiado grande." : "La página es demasiado grande para leer.");
  }

  let buf: Buffer;
  try {
    const leido = await leerCuerpoHasta(res, MAX_BYTES);
    if (leido.cortado) {
      throw new WebFetchError("TOO_LARGE", esPdf ? "El archivo es demasiado grande." : "La página es demasiado grande para leer.");
    }
    buf = leido.bytes;
  } catch (err) {
    if (err instanceof WebFetchError) throw err;
    // El corte a mitad del cuerpo no siempre llega con nombre de corte: lo que manda es la señal.
    if (signal.aborted || esCorte(err)) throw tardoDemasiado();
    throw new WebFetchError("FETCH_FAILED", "Se cortó la descarga de la página.");
  }

  // Si el servidor devuelve un PDF (algunas propuestas se sirven así), reusamos
  // el extractor de documentos.
  if (esPdf) {
    const content = await extractText(buf, "application/pdf");
    return { title: url.hostname, content };
  }

  // HTML (u otro texto)
  const html = new TextDecoder().decode(buf);

  const { convert } = await import("html-to-text");
  const text = convert(html, {
    wordwrap: false,
    selectors: [
      // No incluir el texto de links/imágenes como ruido; quedarse con el contenido.
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
      { selector: "script", format: "skip" },
      { selector: "style", format: "skip" },
      { selector: "nav", format: "skip" },
      { selector: "footer", format: "skip" },
    ],
  })?.trim();

  if (!text || text.length < 20) {
    throw new WebFetchError(
      "EMPTY",
      "No se pudo extraer texto de la página (puede ser una app que carga su contenido con JavaScript).",
    );
  }

  return {
    title: extractHtmlTitle(html, url),
    content: text.slice(0, MAX_EXTRACTED_CHARS),
  };
}
