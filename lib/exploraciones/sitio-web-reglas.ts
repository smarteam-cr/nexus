/**
 * lib/exploraciones/sitio-web-reglas.ts — las reglas para leer el sitio web de una empresa. PURO.
 *
 * Al preparar una exploración, el agente lee el sitio de la empresa para saber qué hace y cómo
 * conectar (pedido de Elías, 2026-10-01). El dominio sale de HubSpot, y en HubSpot lo puede cambiar
 * cualquiera con acceso: por eso se lee con candados, y lo que dice el sitio es DATO, nunca una
 * instrucción para el agente.
 *   - Solo `http(s)` y un nombre de host de verdad: nada de IPs escritas, puertos ni `localhost`.
 *   - El host tiene que resolver a una IP pública (lo verifica el servidor, sitio-web.ts).
 *   - Una redirección solo se sigue dentro del mismo sitio (`acme.com` ↔ `www.acme.com`).
 */
import { isIP } from "node:net";

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
    if (u.protocol !== "https:" && u.protocol !== "http:") continue;
    if (u.port || u.username || u.password) continue;
    const host = u.hostname.toLowerCase().replace(/\.$/, "");
    if (!hostPublicoValido(host)) continue;
    return host;
  }
  return null;
}

/** Un nombre de host con forma de dominio público: nada de IPs escritas, `localhost` ni nombres sin punto. */
export function hostPublicoValido(host: string): boolean {
  if (!host || host.length > 253 || isIP(host.replace(/^\[|\]$/g, "")) !== 0) return false;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (!host.includes(".")) return false;
  return /^[a-z0-9.-]+$/.test(host) && host.split(".").every((p) => p.length > 0 && p.length <= 63 && !p.startsWith("-") && !p.endsWith("-"));
}

/** ¿La IP es interna (privada, loopback, link-local, metadatos de la nube, multicast…)? */
export function ipInterna(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === "::" || x === "::1") return true;
    const mapeada = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x);
    if (mapeada) return ipInterna(mapeada[1]);
    return x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe8") || x.startsWith("fe9") || x.startsWith("fea") || x.startsWith("feb") || x.startsWith("ff");
  }
  return true;
}

/** ¿El host al que redirige es el mismo sitio? (`acme.com`, `www.acme.com` y sus subdominios.) */
export function mismoSitio(base: string, host: string): boolean {
  const raiz = base.replace(/^www\./, "");
  return host === raiz || host.endsWith(`.${raiz}`);
}

/** Cuánto del sitio se le pasa al agente: lo de arriba de la página es lo que dice qué hace la empresa. */
export const MAX_TEXTO_DEL_SITIO = 6000;
