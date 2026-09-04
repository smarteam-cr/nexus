/**
 * lib/hubspot/oauth-state.ts — EL `state` DEL OAUTH DE HUBSPOT, FIRMADO Y ATADO AL NAVEGADOR.
 *
 * ── EL AGUJERO QUE CIERRA (auditoría 2026-09-03, el único hallazgo CRÍTICO) ─────────────────
 * `/api/auth/hubspot` y `/api/auth/callback` eran públicas en el middleware y el `state` viajaba
 * como base64 sin firma. Cualquiera —sin sesión— podía completar el flujo con SU portal de HubSpot
 * y, con `{"system":true}` en el state, el callback BORRABA la cuenta de sistema de Smarteam y
 * guardaba los tokens del portal ajeno como cuenta del sistema. Desde ahí todo el sync, los handoffs
 * y la cobranza leían del portal equivocado. La variante `{clientId}` dejaba atar un portal ajeno a
 * cualquier cliente cuyo id se conociera, y `{newClient}` creaba filas `Client` sin sesión.
 *
 * ── LAS DOS DEFENSAS, Y POR QUÉ HACEN FALTA LAS DOS ─────────────────────────────────────────
 *  1. **La firma** (HMAC-SHA256 con `HUBSPOT_CLIENT_SECRET`, que ya existe en el entorno: no hay
 *     variable nueva). Nadie que no tenga el secreto puede fabricar un state que diga `system`.
 *  2. **El nonce en cookie httpOnly**. La firma sola no alcanza: un state legítimo se podría
 *     capturar de una URL y reutilizar desde otro navegador. El nonce se emite al arrancar el flujo,
 *     viaja en una cookie que solo se manda al callback, y entra en el HMAC — así el state solo
 *     vale para el navegador que lo pidió, y una sola vez (la cookie se borra al volver).
 *
 * ⚠ Es puro a propósito: sin Next, sin Prisma, sin `process.env`. El secreto entra por parámetro
 * para que el test lo controle y para que quede a la vista que una firma sin secreto no es firma.
 *
 * ⚠ La comparación es en tiempo constante (`timingSafeEqual`). Un `===` sobre la firma le
 * permitiría a un atacante paciente adivinarla byte a byte midiendo tiempos.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Lo que el callback necesita saber sobre por qué se arrancó el flujo. */
export type PayloadDeState =
  | { system: true }
  | { clientId: string }
  | { newClient: true }
  /* Sin propósito declarado: la cuenta queda huérfana (ni sistema ni cliente). Es el legado del
     botón «Cambiar cuenta» de /portal; se conserva la forma para no cambiar la conducta. */
  | Record<string, never>;

/** Nombre y ámbito de la cookie del nonce. El `path` acota: solo viaja al callback. */
export const COOKIE_NONCE_OAUTH = "nexus_hs_oauth";
export const PATH_COOKIE_NONCE_OAUTH = "/api/auth/callback";
/** Diez minutos: más que suficiente para autorizar en HubSpot; menos que para olvidarse. */
export const VIDA_DEL_NONCE_SEG = 600;

export function nuevoNonce(): string {
  return randomBytes(16).toString("hex");
}

function firmaDe(cuerpo: string, nonce: string, secreto: string): string {
  return createHmac("sha256", secreto).update(`${cuerpo}.${nonce}`).digest("base64url");
}

/**
 * `base64url(json).firma`. Sin secreto no hay firma: se lanza, no se degrada a base64 pelado —
 * degradar en silencio reabriría exactamente el agujero.
 */
export function firmarState(payload: PayloadDeState, nonce: string, secreto: string): string {
  if (!secreto) throw new Error("firmarState: falta el secreto (HUBSPOT_CLIENT_SECRET)");
  if (!nonce) throw new Error("firmarState: falta el nonce");
  const cuerpo = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${cuerpo}.${firmaDe(cuerpo, nonce, secreto)}`;
}

/**
 * Devuelve el payload SOLO si la firma coincide con este nonce y este secreto. Cualquier otra cosa
 * —state viejo sin firma, nonce de otro navegador, cuerpo alterado, secreto distinto— es `null`.
 * `null` significa «no toques la base»; el callback redirige con `?error=oauth_state`.
 */
export function verificarState(
  state: string | null | undefined,
  nonce: string | null | undefined,
  secreto: string | undefined,
): PayloadDeState | null {
  if (!state || !nonce || !secreto) return null;
  const corte = state.lastIndexOf(".");
  if (corte <= 0 || corte === state.length - 1) return null;
  const cuerpo = state.slice(0, corte);
  const firma = state.slice(corte + 1);
  const esperada = firmaDe(cuerpo, nonce, secreto);
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8"));
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : null;
  } catch {
    return null;
  }
}
