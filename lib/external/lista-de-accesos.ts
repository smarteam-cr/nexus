/**
 * lib/external/lista-de-accesos.ts — un navegador recuerda VARIOS proyectos, no uno.
 *
 * Hasta el 2026-09-10 la cookie `nexus_ext_access` guardaba UNA credencial: verificar un segundo
 * proyecto pisaba el primero, y como la dirección tampoco decía el proyecto, un cliente con dos
 * proyectos —o cualquiera que abriera dos enlaces en el mismo navegador— terminaba viendo el último
 * que abrió creyendo que era el otro.
 *
 * Ahora `nexus_ext_accesos` es una LISTA: entradas `<credencial>.<emitida>` separadas por `~`, la
 * más reciente primero. Cada entrada vence a los 30 días de SU emisión —no de la última vez que se
 * escribió la lista—, así que abrir un proyecto nuevo no le alarga la vida a los otros.
 *
 * ── EL TOPE ──────────────────────────────────────────────────────────────────
 * Con 8 entradas la cookie ronda los 650 bytes. Sin tope, un CSE que abre enlaces de muchos
 * clientes haría crecer la cabecera Cookie de /external hasta que nginx la rechace (8 KB por línea,
 * y en esa misma línea viajan las cookies de sesión de Nexus). Al llegar al tope se cae la más
 * vieja: quien la necesite vuelve a entrar con su enlace, que es lo que hace el CSE de todos modos.
 * Para que el tope no lo gasten entradas MUERTAS (revocadas, con la contraseña cambiada, de un
 * token regenerado), el verify las poda contra la base antes de sumar (`podarListaDeAccesos`).
 *
 * ⚠ La credencial sigue siendo `<token>.<versión>` (lib/external/credencial.ts): cambiar la
 * contraseña de un proyecto invalida SU entrada y deja vivas las demás.
 *
 * PURO: sin Next ni Prisma. Lo usan el endpoint que canjea la contraseña y el lector del servidor.
 */
import { leerCredencial } from "./credencial";

/**
 * La lista. Nombre DISTINTO del de la cookie vieja a propósito: con el mismo nombre y otro path,
 * el navegador manda las dos y Next se queda con una sola — el bug volvería por la ventana.
 */
export const COOKIE_DE_ACCESOS = "nexus_ext_accesos";

/**
 * La cookie de antes: una sola credencial, path /external. ⛔ Solo se LEE: nadie la escribe desde
 * este cambio, así que 30 días después del deploy no queda ninguna viva y su lectura se puede
 * borrar. Mientras tanto cuenta como un proyecto abierto más.
 */
export const COOKIE_HEREDADA = "nexus_ext_access";

export const MAX_ACCESOS_RECORDADOS = 8;
export const VIGENCIA_DE_UN_ACCESO_MS = 30 * 24 * 60 * 60 * 1000;

const SEPARADOR = "~";
const ENTRADA_RE = /^([a-f0-9]{64}\.[a-f0-9]{8})\.([0-9a-z]{1,11})$/i;
/** Margen para relojes: una entrada «del futuro» más allá de esto es basura. */
const TOLERANCIA_FUTURO_MS = 60_000;

interface Entrada {
  credencial: string;
  emitidaMs: number;
}

function parsear(valor: string | null | undefined): Entrada[] {
  if (!valor) return [];
  const out: Entrada[] = [];
  for (const crudo of valor.split(SEPARADOR)) {
    const m = ENTRADA_RE.exec(crudo.trim());
    if (!m) continue;
    const emitidaMs = parseInt(m[2], 36) * 1000;
    if (!Number.isFinite(emitidaMs)) continue;
    out.push({ credencial: m[1].toLowerCase(), emitidaMs });
  }
  // La más reciente primero, sin confiar en el orden en que vino escrita.
  return out.sort((a, b) => b.emitidaMs - a.emitidaMs);
}

/** Vigentes, sin repetir token (gana la más reciente), con tope. Conserva el orden de entrada. */
function normalizar(entradas: Entrada[], ahoraMs: number): Entrada[] {
  const vistos = new Set<string>();
  const out: Entrada[] = [];
  for (const e of entradas) {
    if (e.emitidaMs > ahoraMs + TOLERANCIA_FUTURO_MS) continue;
    if (ahoraMs - e.emitidaMs >= VIGENCIA_DE_UN_ACCESO_MS) continue;
    const token = leerCredencial(e.credencial)?.token;
    if (!token || vistos.has(token)) continue;
    vistos.add(token);
    out.push(e);
    if (out.length === MAX_ACCESOS_RECORDADOS) break;
  }
  return out;
}

const serializar = (entradas: Entrada[]): string =>
  entradas.map((e) => `${e.credencial}.${Math.floor(e.emitidaMs / 1000).toString(36)}`).join(SEPARADOR);

/** Las credenciales vigentes de la cookie, la más reciente primero. Lo que no se entiende se ignora. */
export function leerListaDeAccesos(valor: string | null | undefined, ahoraMs: number): string[] {
  return normalizar(parsear(valor), ahoraMs).map((e) => e.credencial);
}

/**
 * El valor nuevo de la cookie tras canjear una contraseña: esa credencial primero. Si la lista ya
 * tenía una del mismo TOKEN (otra contraseña, u otra vez la misma), la nueva la reemplaza. Las de
 * un token REGENERADO del mismo acceso no se reconocen acá —sin la base no se sabe de qué acceso es
 * un token—: las saca el verify con `podarListaDeAccesos` antes de sumar.
 */
export function sumarALaListaDeAccesos(
  valor: string | null | undefined,
  credencial: string,
  ahoraMs: number,
): string {
  if (!leerCredencial(credencial)) throw new Error("credencial inválida");
  const nueva: Entrada = { credencial: credencial.toLowerCase(), emitidaMs: ahoraMs };
  return serializar(normalizar([nueva, ...parsear(valor)], ahoraMs));
}

/**
 * Deja solo las entradas cuya credencial pasa `conservar`, sin tocar su fecha de emisión. El verify
 * la usa ANTES de sumar, con la lista ya resuelta contra la base: saca lo que ya no abre nada y las
 * entradas viejas del mismo acceso. Sin esto una entrada muerta ocupa lugar en el tope durante 30
 * días y saca de la lista a un proyecto vivo. Lista vacía → `undefined`.
 */
export function podarListaDeAccesos(
  valor: string | null | undefined,
  conservar: (credencial: string) => boolean,
  ahoraMs: number,
): string | undefined {
  const quedan = normalizar(parsear(valor), ahoraMs).filter((e) => conservar(e.credencial));
  return quedan.length > 0 ? serializar(quedan) : undefined;
}

/**
 * Todas las credenciales que trae el navegador: la lista primero y la cookie vieja al final, solo
 * si su proyecto no está ya en la lista (la entrada de la lista es más nueva).
 */
export function credencialesDelNavegador(lista: readonly string[], heredada: string | null | undefined): string[] {
  const out = [...lista];
  const vieja = leerCredencial(heredada);
  if (vieja && !out.some((c) => leerCredencial(c)?.token === vieja.token)) {
    out.push(`${vieja.token}.${vieja.version}`);
  }
  return out;
}
