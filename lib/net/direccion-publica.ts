/**
 * lib/net/direccion-publica.ts — ¿esta dirección es de internet o de adentro? PURO.
 *
 * Lo usan los dos lectores que le piden al servidor una URL que no eligió el código: el que lee una
 * página que pega una persona (lib/documents/fetch-web-page.ts) y el que lee el sitio de una empresa
 * desde HubSpot (lib/exploraciones/sitio-web.ts). Sin estas reglas, el servidor se puede usar para
 * llegar a lo que solo se ve desde adentro: la propia app, la base, los metadatos de la nube.
 *   - Una URL se acepta solo con `http(s)`, sin usuario ni contraseña, sin puerto y con un nombre de
 *     host de verdad (nada de IPs escritas, `localhost` ni nombres sin punto).
 *   - Una IP es interna si cae en un rango que no es de internet. Las IPv6 que llevan una IPv4 adentro
 *     (`::ffff:10.0.0.1`, NAT64, 6to4) se juzgan por esa IPv4. Lo que no se puede leer cuenta como
 *     interno.
 * Que el host resuelva a IPs públicas lo verifica el servidor (pedido-publico.ts), antes de cada pedido.
 */
import { isIP } from "node:net";

/** Un nombre de host con forma de dominio público: nada de IPs escritas, `localhost` ni nombres sin punto. */
export function hostPublicoValido(host: string): boolean {
  if (!host || host.length > 253 || isIP(host.replace(/^\[|\]$/g, "")) !== 0) return false;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (!host.includes(".")) return false;
  // El guion bajo no es de un nombre de host estricto, pero hay subdominios reales con él y el DNS los resuelve.
  return /^[a-z0-9._-]+$/.test(host) && host.split(".").every((p) => p.length > 0 && p.length <= 63 && !p.startsWith("-") && !p.endsWith("-"));
}

function ipv4Interna(ip: string): boolean {
  const [a, b, c] = ip.split(".").map(Number);
  return (
    a === 0 || // «esta red» (0.0.0.0 llega a la propia máquina)
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local y metadatos de la nube (169.254.169.254)
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // asignaciones del IETF y documentación
    (a === 192 && b === 88 && c === 99) || // relé 6to4
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // pruebas de rendimiento
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224 // multicast, reservadas y broadcast
  );
}

/** Los 16 bytes de una IPv6 (acepta `::` y una IPv4 al final). null si no se puede leer. */
function bytesDeIpv6(ip: string): number[] | null {
  let texto = ip.toLowerCase().replace(/%.*$/, "");
  const cola: number[] = [];
  const ipv4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(texto);
  if (ipv4) {
    if (isIP(ipv4[1]) !== 4) return null;
    cola.push(...ipv4[1].split(".").map(Number));
    texto = texto.slice(0, -ipv4[1].length) + "0:0";
  }
  const partes = texto.split("::");
  if (partes.length > 2) return null;
  const grupos = (s: string) => (s ? s.split(":") : []);
  const izquierda = grupos(partes[0]);
  const derecha = partes.length === 2 ? grupos(partes[1]) : [];
  const faltan = 8 - izquierda.length - derecha.length;
  if (partes.length === 2 ? faltan < 1 : faltan !== 0) return null;
  const todos = [...izquierda, ...Array<string>(partes.length === 2 ? faltan : 0).fill("0"), ...derecha];
  const bytes: number[] = [];
  for (const g of todos) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    const n = parseInt(g, 16);
    bytes.push(n >> 8, n & 0xff);
  }
  if (cola.length) bytes.splice(12, 4, ...cola);
  return bytes;
}

const ceros = (bytes: number[], desde: number, hasta: number) => bytes.slice(desde, hasta).every((b) => b === 0);
const ipv4De = (bytes: number[], desde: number) => bytes.slice(desde, desde + 4).join(".");

function ipv6Interna(ip: string): boolean {
  const b = bytesDeIpv6(ip);
  if (!b) return true;
  // ::/96 (sin especificar, loopback, IPv4 compatible) y ::ffff:0:0/96 (IPv4 mapeada)
  if (ceros(b, 0, 10) && ((b[10] === 0 && b[11] === 0) || (b[10] === 0xff && b[11] === 0xff))) {
    return ceros(b, 10, 12) && ceros(b, 12, 15) ? true : ipv4Interna(ipv4De(b, 12));
  }
  // ::ffff:0:0/96 (IPv4 traducida, SIIT): la IPv4 va al final
  if (ceros(b, 0, 8) && b[8] === 0xff && b[9] === 0xff && ceros(b, 10, 12)) return ipv4Interna(ipv4De(b, 12));
  // El resto de ::/64 no es de internet
  if (ceros(b, 0, 8)) return true;
  // 64:ff9b::/96 (NAT64): la IPv4 va al final
  if (b[0] === 0 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && ceros(b, 4, 12)) return ipv4Interna(ipv4De(b, 12));
  // 64:ff9b:1::/48 (NAT64 de uso local)
  if (b[0] === 0 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && b[4] === 0 && b[5] === 1) return true;
  // 2002::/16 (6to4): la IPv4 va en los bytes 2 a 5
  if (b[0] === 0x20 && b[1] === 0x02) return ipv4Interna(ipv4De(b, 2));
  // 2001::/32 (Teredo) y 2001:db8::/32 (documentación)
  if (b[0] === 0x20 && b[1] === 0x01 && ((b[2] === 0 && b[3] === 0) || (b[2] === 0x0d && b[3] === 0xb8))) return true;
  // 100::/64 (descarte)
  if (b[0] === 0x01 && b[1] === 0 && ceros(b, 2, 8)) return true;
  return (
    (b[0] & 0xfe) === 0xfc || // fc00::/7, únicas locales
    (b[0] === 0xfe && b[1] >= 0x80) || // fe80::/10 link-local y fec0::/10 site-local
    b[0] === 0xff // multicast
  );
}

/** ¿La IP es interna (privada, loopback, link-local, metadatos de la nube, multicast…)? Lo que no es IP, sí. */
export function ipInterna(ip: string): boolean {
  const limpia = ip.replace(/^\[|\]$/g, "");
  const v = isIP(limpia);
  if (v === 4) return ipv4Interna(limpia);
  if (v === 6) return ipv6Interna(limpia);
  return true;
}

export type MotivoUrlNoPublica = "PROTOCOLO" | "CREDENCIALES" | "PUERTO" | "HOST";

/** El host de una URL tal como se pide (minúsculas, sin el punto final). */
export function hostDeUrl(url: URL): string {
  return url.hostname.toLowerCase().replace(/\.$/, "");
}

/** Por qué una URL no se puede pedir desde el servidor, o null si su forma es de internet. No mira el DNS. */
export function motivoUrlNoPublica(url: URL): MotivoUrlNoPublica | null {
  if (url.protocol !== "https:" && url.protocol !== "http:") return "PROTOCOLO";
  if (url.username || url.password) return "CREDENCIALES";
  if (url.port) return "PUERTO";
  if (!hostPublicoValido(hostDeUrl(url))) return "HOST";
  return null;
}
