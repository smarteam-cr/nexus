/**
 * lib/business-cases/access-url.ts
 *
 * ÚNICO lugar que arma la URL que el prospecto recibe. Sin dependencias (ni Prisma ni
 * Next): lo importan tanto las rutas de API como las páginas públicas.
 *
 * ── UNA SOLA PUERTA (2026-09-10) ─────────────────────────────────────────────
 * La propuesta se abre por `/external/propuesta/{token}`: la URL es el secreto (token de 256
 * bits). Hasta el 2026-09-10 había una segunda puerta, CON contraseña (verify → cookie →
 * `/external/business-case`), y se RETIRÓ en vez de rehacerla:
 *
 *   - Nadie la usaba. Medido ese día en producción: 0 de las 14 propuestas vivas pedían
 *     contraseña, y ninguna de las 6 creadas desde la apertura masiva del 2026-08-20 la encendió.
 *   - Tenía el defecto del incidente de proyectos (Judesur pedido, Wherex servido): el navegador
 *     guardaba UNA cookie y la dirección de destino no nombraba la propuesta. Una dirección
 *     reenviada mostraba la última propuesta abierta en ese navegador — o, si esa ya estaba
 *     abierta, dejaba en la barra SU enlace, con precios.
 *
 * Los enlaces con contraseña que siguen en correos ya enviados no quedan muertos: esa dirección
 * lleva a la propuesta del token de SU PROPIA URL (app/external/business-case/verify/[token]).
 *
 * El token no rota: republicar deja el link exactamente como estaba. La única rotación es la de
 * un acceso REVOCADO que se vuelve a subir (`ensureAccess`, lib/business-cases/mutations.ts): si
 * un link se filtró, se revoca y se sube de nuevo.
 *
 * ⚠ Si algún día vuelve a hacer falta una propuesta protegida, NO se revive el modo viejo: se
 * construye como el acceso de proyectos (la dirección nombra el acceso, el navegador recuerda
 * varios y el resolver exige el id — lib/external/rutas.ts y lib/external/lista-de-accesos.ts).
 * Lo hace cumplir el candado 11 de lib/external/propuesta-abierta.test.ts.
 */

/** La única puerta de la propuesta. */
export const BC_OPEN_BASE = "/external/propuesta";

/** Path relativo de la propuesta (para `redirect()` dentro de la app). */
export function bcOpenPath(token: string): string {
  return `${BC_OPEN_BASE}/${token}`;
}

/**
 * URL ABSOLUTA para copiar y pegar en un correo.
 *
 * `base` tiene que salir de `APP_URL` (con fallback al origin del request): en el deploy
 * self-hosted el request entra por la red interna y el origin sería `localhost:3000` — un
 * link que no le sirve a nadie. Mismo criterio que /api/roles/[id]/publico.
 */
export function buildBcAccessUrl(base: string, token: string): string {
  return `${base.replace(/\/+$/, "")}${bcOpenPath(token)}`;
}
