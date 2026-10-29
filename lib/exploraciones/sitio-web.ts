/**
 * lib/exploraciones/sitio-web.ts — leer la portada del sitio web de la empresa, con candados. SERVIDOR.
 *
 * Al preparar, el agente lee el sitio para saber qué hace la empresa y cómo conectar con ella. Las
 * reglas del sitio (qué host, qué redirección) están en sitio-web-reglas.ts; el pedido lo hace
 * lib/net/pedido-publico.ts, el mismo que lee las páginas que pega una persona. Acá:
 *   - antes de cada pedido se resuelve el host y se rechaza si alguna IP es interna, y la conexión
 *     va a esa misma IP (sin DNS rebinding);
 *   - las redirecciones se siguen a mano, hasta 3, y solo dentro del mismo sitio;
 *   - 8 segundos y 1,5 MB como máximo, y solo HTML.
 * Cualquier falla devuelve null: sin el sitio, la preparación sigue con HubSpot.
 */
import "server-only";
import { hostDeUrl, hostPublicoValido } from "@/lib/net/direccion-publica";
import { leerCuerpoHasta, pedirUrlPublica } from "@/lib/net/pedido-publico";
import { textoPlano } from "./hubspot";
import { MAX_TEXTO_DEL_SITIO, mismoSitio } from "./sitio-web-reglas";

const TIEMPO_MAXIMO_MS = 8_000;
const MAX_BYTES = 1_500_000;
const MAX_REDIRECCIONES = 3;

/** El texto legible de una página: el título, la descripción y el cuerpo, sin menús ni scripts. */
async function textoDelHtml(html: string): Promise<string> {
  const titulo = /<title[^>]*>([^<]{1,200})<\/title>/i.exec(html)?.[1]?.trim();
  const descripcion =
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,400})["']/i.exec(html)?.[1] ??
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{1,400})["']/i.exec(html)?.[1];
  const { convert } = await import("html-to-text");
  const cuerpo = convert(html, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
      { selector: "script", format: "skip" },
      { selector: "style", format: "skip" },
      { selector: "noscript", format: "skip" },
      { selector: "svg", format: "skip" },
      { selector: "nav", format: "skip" },
      { selector: "footer", format: "skip" },
      { selector: "form", format: "skip" },
    ],
  })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return [titulo && `Título: ${textoPlano(titulo)}`, descripcion && `Descripción: ${textoPlano(descripcion)}`, cuerpo].filter(Boolean).join("\n").slice(0, MAX_TEXTO_DEL_SITIO);
}

/** La portada del sitio de la empresa, como texto. null si no se pudo leer con seguridad. */
export async function leerSitioWeb(host: string | null): Promise<{ url: string; texto: string } | null> {
  if (!host || !hostPublicoValido(host)) return null;
  try {
    const { res, url } = await pedirUrlPublica(new URL(`https://${host}/`), {
      maxRedirecciones: MAX_REDIRECCIONES,
      permitirSalto: (destino) => mismoSitio(host, hostDeUrl(destino)),
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
      /* Con un agente propio, los sitios en HubSpot CMS y detrás de Cloudflare responden 403 (probado
         el 2026-10-01 con smarteamcr.com y hubspot.com): se pide como un navegador común. */
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "es-CR,es;q=0.9,en;q=0.8",
      },
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("text/html")) {
      await res.body?.cancel().catch(() => {});
      return null;
    }
    const { bytes } = await leerCuerpoHasta(res, MAX_BYTES);
    if (bytes.length === 0) return null;
    const texto = await textoDelHtml(new TextDecoder().decode(bytes));
    return texto.length >= 40 ? { url: url.toString(), texto } : null;
  } catch (e) {
    console.error(`[exploraciones/sitio-web] ${host}`, e instanceof Error ? e.message : e);
    return null;
  }
}
