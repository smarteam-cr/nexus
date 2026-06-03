/**
 * lib/documents/fetch-web-page.ts
 *
 * Descarga una página web pública y extrae su texto legible. Sirve para leer
 * propuestas comerciales que viven como URL web (no como archivo ni Google Doc).
 *
 * Seguridad (SSRF): este helper hace fetch de URLs provistas por el usuario
 * desde el servidor. Aunque el endpoint es interno (solo CSEs autenticados),
 * bloqueamos hostnames privados / localhost / metadata de cloud para no permitir
 * que se use el server como proxy a recursos internos.
 *
 * Limitaciones conocidas:
 *   - Páginas SPA (Notion, Pitch, Canva, etc. que renderizan con JS) pueden
 *     devolver HTML casi vacío — el texto vive en JS, no en el HTML inicial.
 *     Es "best effort": si el HTML trae texto, lo extrae; si no, content corto.
 */

import { extractText, MAX_EXTRACTED_CHARS } from "@/lib/documents/extract-text";

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

/**
 * Valida que la URL sea http(s) y no apunte a un host privado/interno.
 * Lanza WebFetchError("INVALID_URL" | "BLOCKED") si no es segura.
 */
function assertSafePublicUrl(rawUrl: string): URL {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new WebFetchError("INVALID_URL", "La URL no es válida.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new WebFetchError("INVALID_URL", "Solo se admiten URLs http(s).");
  }

  const host = u.hostname.toLowerCase();

  // localhost y variantes
  if (host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0") {
    throw new WebFetchError("BLOCKED", "No se permiten direcciones locales.");
  }

  // IPv4 privadas / link-local / loopback / metadata
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    const isPrivate =
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) || // link-local + cloud metadata 169.254.169.254
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168);
    if (isPrivate) {
      throw new WebFetchError("BLOCKED", "No se permiten direcciones de red privadas.");
    }
  }

  // IPv6 loopback / link-local
  if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) {
    throw new WebFetchError("BLOCKED", "No se permiten direcciones IPv6 internas.");
  }

  return u;
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
  const url = assertSafePublicUrl(rawUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        // Algunos sitios bloquean fetchers sin UA. Nos identificamos honestamente.
        "User-Agent": "NexusBot/1.0 (+document-reader; internal use)",
        Accept: "text/html,application/xhtml+xml,application/pdf,*/*",
      },
    });
  } catch (err) {
    clearTimeout(timeout);
    const aborted = err instanceof Error && err.name === "AbortError";
    throw new WebFetchError(
      "FETCH_FAILED",
      aborted ? "La página tardó demasiado en responder." : "No se pudo acceder a la página.",
    );
  }
  clearTimeout(timeout);

  if (!res.ok) {
    throw new WebFetchError("FETCH_FAILED", `La página respondió con estado ${res.status}.`);
  }

  const contentType = res.headers.get("content-type") ?? "";

  // Si el servidor devuelve un PDF (algunas propuestas se sirven así), reusamos
  // el extractor de documentos.
  if (contentType.includes("application/pdf")) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) throw new WebFetchError("TOO_LARGE", "El archivo es demasiado grande.");
    const content = await extractText(buf, "application/pdf");
    return { title: url.hostname, content };
  }

  // HTML (u otro texto)
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) {
    throw new WebFetchError("TOO_LARGE", "La página es demasiado grande para leer.");
  }
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
