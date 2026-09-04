/**
 * lib/observability/csp.ts — LAS CABECERAS DE SEGURIDAD DE TODA LA APP, EN UN SOLO LUGAR.
 *
 * Auditoría 2026-09-03 (A-13): Nexus salía sin `X-Frame-Options`, sin `nosniff` y sin ninguna
 * Content-Security-Policy. Las consume `next.config.ts` (`headers()` para `/:path*`) y las
 * prueba `lib/external/propuesta-abierta.test.ts` (candado 4).
 *
 * ── LA CSP NACE EN REPORT-ONLY, A PROPÓSITO ─────────────────────────────────────────────────
 * Una CSP que se enciende a ciegas rompe la app en silencio en el navegador de un cliente (un
 * logo que no carga, un diagrama en blanco) y nadie se entera hasta la queja. Report-Only no
 * bloquea nada: el navegador solo REPORTA lo que la política bloquearía. Con `report-uri`
 * apuntando al endpoint de seguridad de Sentry (derivado del DSN público, que ya viaja como
 * build-arg), los reportes llegan al mismo panel que los errores. Endurecer (pasar a
 * `Content-Security-Policy`, quitar `unsafe-inline`/`unsafe-eval` con nonces) es una tanda
 * propia, DESPUÉS de leer los reportes de producción.
 *
 * ⛔ Sin `frame-ancestors`: el plan lo excluye —`X-Frame-Options: DENY` ya cubre el framing—
 * y una directiva mal puesta el día que la CSP se endurezca rompería el iframe `srcdoc` del
 * motor de landing o el PDF. HSTS no va acá: es de nginx (Elías).
 */

export interface OpcionesCsp {
  /** Endpoint donde el navegador manda las violaciones; sin él, solo la consola del navegador. */
  reportUri?: string | null;
}

/**
 * Lo que la app carga hoy, medido: scripts y estilos inline de Next (y `eval` en dev), logos de
 * clientes en Supabase Storage y `data:` de los diagramas, Sentry y Supabase por fetch, los
 * iframes `srcdoc` del motor de landing y los PDFs en `blob:`. Ningún script ni fuente externos
 * (`next/font` sirve las fuentes desde el propio origen).
 */
export const DIRECTIVAS_CSP: readonly string[] = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "frame-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];

/** La política como cabecera; con `reportUri`, además le dice al navegador adónde reportar. */
export function politicaCsp(opts: OpcionesCsp = {}): string {
  const partes = [...DIRECTIVAS_CSP];
  if (opts.reportUri) partes.push(`report-uri ${opts.reportUri}`);
  return partes.join("; ");
}

/**
 * El endpoint de reportes CSP de Sentry a partir del DSN público:
 * `https://<key>@<host>/<proyecto>` → `https://<host>/api/<proyecto>/security/?sentry_key=<key>`.
 * `null` si no hay DSN o no tiene esa forma — entonces la CSP va sin `report-uri`, nunca rota.
 */
export function reportUriDesdeDsn(dsn: string | null | undefined): string | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const proyecto = u.pathname.replace(/^\/+/, "");
    if (!u.username || !/^\d+$/.test(proyecto)) return null;
    return `${u.protocol}//${u.host}/api/${proyecto}/security/?sentry_key=${u.username}`;
  } catch {
    return null;
  }
}

export interface Cabecera {
  key: string;
  value: string;
}

/** Las tres cabeceras para `/:path*`. Report-Only, no `Content-Security-Policy`: ver el encabezado. */
export function CABECERAS_DE_SEGURIDAD(opts: OpcionesCsp = {}): Cabecera[] {
  return [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Content-Security-Policy-Report-Only", value: politicaCsp(opts) },
  ];
}
