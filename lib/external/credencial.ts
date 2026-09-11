/**
 * lib/external/credencial.ts — LA COOKIE EXTERNA LLEVA EL TOKEN **Y** LA VERSIÓN DE LA CONTRASEÑA.
 *
 * Auditoría 2026-09-03 (A-11): las cookies `nexus_ext_access` / `nexus_bc_access` transportaban
 * el token pelado y valían 30 días pasara lo que pasara. (La de la propuesta ya no existe: se fue
 * con el modo con contraseña el 2026-09-10. Hoy la credencial solo vive en la lista de proyectos
 * abiertos del navegador, lib/external/lista-de-accesos.ts.) Cambiar la contraseña del enlace —el
 * gesto que un CSE hace justamente cuando sospecha que se filtró— no expulsaba a nadie: quien ya
 * había entrado seguía entrando hasta que la cookie venciera sola.
 *
 * Ahora la cookie es `<token>.<versión>`, y la versión se DERIVA del hash vigente de la
 * contraseña (los primeros 8 hex de sha256(passwordHash)): sin columna nueva, sin migración, y
 * cambiar la contraseña cambia el hash → cambia la versión → toda cookie viva deja de coincidir
 * y el cliente vuelve a poner la contraseña. Regenerar el acceso (token nuevo) ya mataba la
 * cookie; ahora cambiar SOLO la contraseña también.
 *
 * ⚠ Una cookie vieja (token sin versión) no coincide con nada: al deployar esto, cada cliente
 * vuelve a escribir la contraseña UNA vez. Aceptado (decisión por default del plan 2026-09-04).
 *
 * La versión no es secreta ni sirve para nada sin el token: es 8 hex de un hash de un hash.
 */
import { createHash, timingSafeEqual } from "node:crypto";

export const LARGO_DE_VERSION = 8;

/** `<64 hex>.<8 hex>` — el único formato que un chokepoint acepta desde la cookie. */
export const CREDENCIAL_RE = /^([a-f0-9]{64})\.([a-f0-9]{8})$/i;

export interface Credencial {
  token: string;
  version: string;
}

/** Los primeros 8 hex de sha256(passwordHash): cambia si y solo si cambia la contraseña. */
export function versionDeCredencial(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("hex").slice(0, LARGO_DE_VERSION);
}

/** Lo que va en la cookie: el token más la versión del hash con el que se canjeó la contraseña. */
export function armarCredencial(token: string, passwordHash: string): string {
  return `${token}.${versionDeCredencial(passwordHash)}`;
}

/** Parsea el valor de la cookie. Un token pelado (cookie anterior a A-11) devuelve null. */
export function leerCredencial(valor: string | null | undefined): Credencial | null {
  const m = valor ? CREDENCIAL_RE.exec(valor) : null;
  if (!m) return null;
  return { token: m[1], version: m[2].toLowerCase() };
}

/** ¿La versión que trae la cookie es la del hash vigente? Comparación en tiempo constante. */
export function credencialVigente(cred: Credencial, passwordHash: string): boolean {
  const esperada = Buffer.from(versionDeCredencial(passwordHash), "utf8");
  const recibida = Buffer.from(cred.version.toLowerCase(), "utf8");
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}
