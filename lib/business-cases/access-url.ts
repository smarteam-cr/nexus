/**
 * lib/business-cases/access-url.ts
 *
 * ÚNICO lugar que arma la URL que el prospecto recibe. Sin dependencias (ni Prisma ni
 * Next): lo importan tanto las rutas de API como las páginas públicas.
 *
 * ── LA REGLA MEDULAR DEL MÓDULO ──────────────────────────────────────────────
 * Un token por propuesta, que NO rota. El MODO decide cuál de las dos puertas sirve, y
 * la otra REDIRIGE a la que sirve:
 *
 *   requiresPassword=false → /external/propuesta/{token}                 (render directo)
 *   requiresPassword=true  → /external/business-case/verify/{token}      (contraseña → cookie)
 *
 * Que el token no rote es lo que permite que ningún link ya enviado quede muerto cuando
 * Ventas cambia el modo — incluida la apertura masiva del 2026-08-20, donde toda propuesta
 * viva pasó de contraseña a abierta y el link de los correos ya enviados siguió andando.
 *
 * Corolario que hay que tener presente: como el token no rota, ABRIR una propuesta que
 * estaba protegida le da acceso a todo el que alguna vez vio esa URL. Es exactamente la
 * decisión que tomó Ventas; si algún día se quiere lo contrario, el lugar es
 * `setAccessMode` (rotar ahí), no acá.
 */

/** Puerta ABIERTA: la URL es el secreto (token de 256 bits). */
export const BC_OPEN_BASE = "/external/propuesta";
/** Puerta con CONTRASEÑA: form de verify que canjea contraseña por cookie. */
export const BC_VERIFY_BASE = "/external/business-case/verify";
/** Landing servido por cookie (solo modo con contraseña). */
export const BC_COOKIE_PATH = "/external/business-case";

/** Path relativo de la puerta abierta (para `redirect()` dentro de la app). */
export function bcOpenPath(token: string): string {
  return `${BC_OPEN_BASE}/${token}`;
}

/** Path relativo de la puerta con contraseña. */
export function bcVerifyPath(token: string): string {
  return `${BC_VERIFY_BASE}/${token}`;
}

/** Path que corresponde al modo vigente. */
export function bcPathForMode(token: string, requiresPassword: boolean): string {
  return requiresPassword ? bcVerifyPath(token) : bcOpenPath(token);
}

/**
 * URL ABSOLUTA para copiar y pegar en un correo.
 *
 * `base` tiene que salir de `APP_URL` (con fallback al origin del request): en el deploy
 * self-hosted el request entra por la red interna y el origin sería `localhost:3000` — un
 * link que no le sirve a nadie. Mismo criterio que /api/roles/[id]/publico.
 */
export function buildBcAccessUrl(base: string, token: string, requiresPassword: boolean): string {
  return `${base.replace(/\/+$/, "")}${bcPathForMode(token, requiresPassword)}`;
}
