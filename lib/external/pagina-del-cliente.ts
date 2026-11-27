/**
 * lib/external/pagina-del-cliente.ts — lo que el equipo decide de la página del cronograma que ve el cliente
 * (2026-11-27, kölbi). Puro y client-safe.
 *
 * Vive en `ProjectTimeline.paginaDelCliente` (un cronograma de proyecto O de un plan general: la misma columna sirve a
 * las dos páginas, /external/cronograma y /external/plan). Cruza al cliente SOLO dentro de la foto publicada: el
 * chokepoint del cronograma (lib/external/timeline-view.ts) la lee junto con las fases, y al «Subir al cliente» o
 * «Publicar» queda congelada con ellas. Cambiarla es un cambio sin publicar, como mover una fase.
 *
 * Todo es opcional y lo ausente es «como siempre»: una página que nadie tocó se ve igual que antes de que esto
 * existiera, y una foto vieja (sin `pagina`) también.
 *
 * ⚠ `titulo` distingue AUSENTE de VACÍO: ausente = el título de siempre de esa página («Cronograma de proyecto» /
 * «Plan de trabajo»); "" = la página va sin título (Elías, 26 nov: «eso que dice "Plan de trabajo · kölbi" debe poder
 * borrarse»).
 *
 * ⚠ SIN zod a propósito: lo importan las pantallas (TimelineLanding, el Gantt) y zod pesa 266 KB en el navegador (C-24).
 * La validación de lo que se guarda vive en lib/external/pagina-del-cliente-schema.ts, que solo usan las rutas.
 */
export const TITULO_MAX = 120;

/** Los titulares de siempre de cada página, y su texto cuando todavía no hay fases. Los usan la página externa y la
 *  vista de adentro: un solo lugar, para que lo que ve el equipo sea lo que ve el cliente. */
export const PAGINA_DEL_CRONOGRAMA = {
  titulo: "Cronograma de proyecto",
  vacio: "Estamos preparando el cronograma de tu proyecto — pronto lo vas a ver aquí.",
} as const;
export const PAGINA_DEL_PLAN = {
  titulo: "Plan de trabajo",
  vacio: "Estamos preparando tu plan de trabajo — pronto lo vas a ver aquí.",
} as const;
export const BIENVENIDA_MAX = 600;

/** Lo que se guarda. Todo opcional: lo ausente es «como siempre». La validación: pagina-del-cliente-schema.ts. */
export interface PaginaDelCliente {
  /** Ausente = el de siempre; "" = sin título. */
  titulo?: string;
  conNombre?: boolean;
  conLogo?: boolean;
  bienvenida?: string;
  conAtrasadas?: boolean;
  conResponsables?: boolean;
  conResumen?: boolean;
}

/** La página con todo resuelto: lo que pinta el render. */
export interface PaginaResuelta {
  /** "" = sin título. */
  titulo: string;
  conNombre: boolean;
  conLogo: boolean;
  /** "" = sin bienvenida. */
  bienvenida: string;
  conAtrasadas: boolean;
  conResponsables: boolean;
  conResumen: boolean;
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Lectura TOLERANTE (de la base o de una foto congelada): se queda con lo que tiene la forma correcta y descarta el
 * resto. Devuelve null si no queda nada, así una página sin tocar no agrega nada a la foto (y una foto vieja y una
 * nueva de lo mismo son iguales).
 */
export function leerPaginaDelCliente(raw: unknown): PaginaDelCliente | null {
  if (!esObjeto(raw)) return null;
  const out: PaginaDelCliente = {};
  if (typeof raw.titulo === "string") out.titulo = raw.titulo.trim().slice(0, TITULO_MAX);
  if (typeof raw.bienvenida === "string" && raw.bienvenida.trim()) out.bienvenida = raw.bienvenida.trim().slice(0, BIENVENIDA_MAX);
  for (const k of ["conNombre", "conLogo", "conAtrasadas", "conResponsables", "conResumen"] as const) {
    if (typeof raw[k] === "boolean") out[k] = raw[k];
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Lo que se guarda, en su forma mínima: sin los valores que son el de siempre. En el plan general, «apagar y volver a
 * prender» deja la página como nunca tocada (su aviso compara la foto). En un proyecto el aviso es «editado después de
 * subir», así que un ida y vuelta sí lo enciende; lo que se evita es marcarlo cuando lo guardado no cambió.
 */
export function compactarPagina(p: PaginaDelCliente): PaginaDelCliente | null {
  const out: PaginaDelCliente = {};
  if (p.titulo !== undefined) out.titulo = p.titulo.trim();
  if (p.bienvenida?.trim()) out.bienvenida = p.bienvenida.trim();
  for (const k of ["conNombre", "conLogo", "conAtrasadas", "conResponsables", "conResumen"] as const) {
    if (p[k] === false) out[k] = false;
  }
  return Object.keys(out).length ? out : null;
}

/** Lo que el Gantt muestra u oculta (la página, el documento y su PDF lo leen de acá: dicen lo mismo). */
export function opcionesDelCronograma(p: PaginaDelCliente | null | undefined): {
  conAtrasadas: boolean;
  conResponsables: boolean;
  conResumen: boolean;
} {
  return { conAtrasadas: p?.conAtrasadas ?? true, conResponsables: p?.conResponsables ?? true, conResumen: p?.conResumen ?? true };
}

/** ¿Dos páginas guardadas son la misma? (en su forma mínima, sin importar el orden de las claves). */
export function mismaPagina(a: PaginaDelCliente | null | undefined, b: PaginaDelCliente | null | undefined): boolean {
  const forma = (p: PaginaDelCliente | null | undefined) => {
    const c = p ? compactarPagina(p) : null;
    return c ? JSON.stringify(Object.keys(c).sort().map((k) => [k, c[k as keyof PaginaDelCliente]])) : "";
  };
  return forma(a) === forma(b);
}

/** Con los valores de siempre. `tituloDeSiempre` es el de esa página («Cronograma de proyecto» / «Plan de trabajo»). */
export function resolverPagina(p: PaginaDelCliente | null | undefined, tituloDeSiempre: string): PaginaResuelta {
  return {
    titulo: p?.titulo !== undefined ? p.titulo.trim() : tituloDeSiempre,
    conNombre: p?.conNombre ?? true,
    conLogo: p?.conLogo ?? true,
    bienvenida: p?.bienvenida?.trim() ?? "",
    conAtrasadas: p?.conAtrasadas ?? true,
    conResponsables: p?.conResponsables ?? true,
    conResumen: p?.conResumen ?? true,
  };
}
