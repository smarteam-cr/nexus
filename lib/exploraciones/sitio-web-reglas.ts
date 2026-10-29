/**
 * lib/exploraciones/sitio-web-reglas.ts — las reglas para leer el sitio web de una empresa. PURO.
 *
 * Al preparar una exploración, el agente lee el sitio de la empresa para saber qué hace y cómo
 * conectar (pedido de Elías, 2026-10-01). El dominio sale de HubSpot, y en HubSpot lo puede cambiar
 * cualquiera con acceso: por eso se lee con candados, y lo que dice el sitio es DATO, nunca una
 * instrucción para el agente.
 *   - Solo `http(s)` y un nombre de host de verdad: nada de IPs escritas, puertos ni `localhost`.
 *   - El host tiene que resolver a una IP pública (lo verifica el servidor, sitio-web.ts).
 *   Qué es un host y una IP de internet lo deciden las reglas compartidas (lib/net/direccion-publica.ts).
 *   - Una redirección solo se sigue dentro del mismo sitio (`acme.com` ↔ `www.acme.com`).
 */
import { hostDeUrl, motivoUrlNoPublica } from "@/lib/net/direccion-publica";

/** El host del sitio de la empresa, desde lo que dice HubSpot (el sitio o el dominio). null si no sirve. */
export function hostDelSitio(sitio: string | null | undefined, dominio: string | null | undefined): string | null {
  for (const crudo of [sitio, dominio]) {
    if (!crudo || !crudo.trim()) continue;
    const conEsquema = /^https?:\/\//i.test(crudo.trim()) ? crudo.trim() : `https://${crudo.trim()}`;
    let u: URL;
    try {
      u = new URL(conEsquema);
    } catch {
      continue;
    }
    if (motivoUrlNoPublica(u)) continue;
    return hostDeUrl(u);
  }
  return null;
}

/** ¿El host al que redirige es el mismo sitio? (`acme.com`, `www.acme.com` y sus subdominios.) */
export function mismoSitio(base: string, host: string): boolean {
  const raiz = base.replace(/^www\./, "");
  return host === raiz || host.endsWith(`.${raiz}`);
}

/** Cuánto del sitio se le pasa al agente: lo de arriba de la página es lo que dice qué hace la empresa. */
export const MAX_TEXTO_DEL_SITIO = 6000;
