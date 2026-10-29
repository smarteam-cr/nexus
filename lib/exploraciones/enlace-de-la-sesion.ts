/**
 * El enlace de una sesión de la exploración (Elías, 2026-10-28: «que cada sesión genere una URL diferente… para poder
 * pasar el enlace del análisis de una sesión específica»). Es un enlace INTERNO: abre la página de siempre, con su guarda
 * (`preventa.read` en Ventas › Preventa, el acceso a la empresa en la ficha del cliente).
 *
 * La sesión va por su id (`?sesion=`), nunca por su número en la lista: borrar o agregar una sesión no cambia a cuál
 * apunta un enlace viejo. La pestaña va en palabras (`?momento=preparacion | en-vivo | analisis`); por dentro siguen
 * siendo antes, durante y después. Sin `momento`, la sesión abre en la pestaña que le toca (lib: useSesiones).
 */

/** Antes (la guía), durante (las notas del vendedor) y después (la reunión y lo que salió). */
export type MomentoDeLaSesion = "antes" | "durante" | "despues";

export const PARAMETRO_DE_LA_SESION = "sesion";
export const PARAMETRO_DEL_MOMENTO = "momento";

/** Cómo se escribe cada pestaña en la dirección: las palabras de la pantalla (Preparación, En vivo, Análisis). */
const EN_LA_DIRECCION: Record<MomentoDeLaSesion, string> = { antes: "preparacion", durante: "en-vivo", despues: "analisis" };
const DE_LA_DIRECCION: Record<string, MomentoDeLaSesion> = {
  preparacion: "antes",
  "en-vivo": "durante",
  analisis: "despues",
  // Las claves de adentro también se entienden (un enlace armado a mano).
  antes: "antes",
  durante: "durante",
  despues: "despues",
};

/**
 * La clave de una sesión: su id (`s-…`), la de una reunión que entró sola (`r-meet-…`) o `nueva` (la próxima, sin
 * planear). Lo demás no se acepta: la dirección la puede escribir cualquiera.
 */
const CLAVE_VALIDA = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

export interface SesionEnLaDireccion {
  sesion: string | null;
  momento: MomentoDeLaSesion | null;
}

/** Lee la sesión y su pestaña de la dirección. Una pestaña sin sesión no significa nada y se ignora. */
export function sesionDeLaDireccion(params: { get(nombre: string): string | null }): SesionEnLaDireccion {
  const crudo = params.get(PARAMETRO_DE_LA_SESION)?.trim() ?? "";
  const sesion = CLAVE_VALIDA.test(crudo) ? crudo : null;
  if (!sesion) return { sesion: null, momento: null };
  const m = params.get(PARAMETRO_DEL_MOMENTO)?.trim().toLowerCase() ?? "";
  return { sesion, momento: Object.hasOwn(DE_LA_DIRECCION, m) ? DE_LA_DIRECCION[m] : null };
}

/**
 * La misma dirección con esta sesión y esta pestaña (o sin ninguna, con `sesion` null). No toca los demás parámetros
 * (`pieza`, `tab`, `canvas`…). Devuelve una URL nueva.
 */
export function conLaSesion(url: URL, sesion: string | null, momento: MomentoDeLaSesion | null = null): URL {
  const nueva = new URL(url.href);
  if (sesion && CLAVE_VALIDA.test(sesion)) {
    nueva.searchParams.set(PARAMETRO_DE_LA_SESION, sesion);
    if (momento) nueva.searchParams.set(PARAMETRO_DEL_MOMENTO, EN_LA_DIRECCION[momento]);
    else nueva.searchParams.delete(PARAMETRO_DEL_MOMENTO);
  } else {
    nueva.searchParams.delete(PARAMETRO_DE_LA_SESION);
    nueva.searchParams.delete(PARAMETRO_DEL_MOMENTO);
  }
  return nueva;
}

/** Sin la sesión ni su pestaña: al salir de Exploración, la dirección deja de nombrarlas. */
export const sinLaSesion = (url: URL): URL => conLaSesion(url, null);

/** Lo mismo sobre unos parámetros sueltos (la ficha del cliente arma los suyos al cambiar de proyecto). Los cambia en su lugar. */
export function sacarLaSesion(params: URLSearchParams): void {
  params.delete(PARAMETRO_DE_LA_SESION);
  params.delete(PARAMETRO_DEL_MOMENTO);
}

/** Lo que hace falta de cada sesión que se muestra (una `PestanaDeSesion` de lib/exploraciones/guia.ts). */
export interface SesionQueSeMuestra {
  clave: string;
  reunion: { origen: string; id: string } | null;
}

/** La próxima sesión sin planear: no está en la lista, pero se puede abrir. */
export const CLAVE_DE_LA_PROXIMA = "nueva";

/**
 * ¿La sesión que pide la dirección está en ESTA exploración, y con qué clave? `sin-pedido` si no pide ninguna; `no-esta`
 * si ya no existe (la quitaron) o es de otra exploración: ahí se abre el inicio con un aviso, no una sesión cualquiera.
 * Una reunión que entró sola (`r-meet-…`) se vuelve sesión (`s-…`) cuando alguien le escribe: el enlace viejo la sigue
 * encontrando por su reunión.
 */
export function sesionPedida(
  pedida: string | null,
  sesiones: readonly SesionQueSeMuestra[],
): { estado: "sin-pedido" } | { estado: "esta"; clave: string } | { estado: "no-esta" } {
  if (!pedida) return { estado: "sin-pedido" };
  if (pedida === CLAVE_DE_LA_PROXIMA || sesiones.some((s) => s.clave === pedida)) return { estado: "esta", clave: pedida };
  const deSuReunion = sesiones.find((s) => s.reunion && `r-${s.reunion.origen}-${s.reunion.id}` === pedida);
  return deSuReunion ? { estado: "esta", clave: deSuReunion.clave } : { estado: "no-esta" };
}

/**
 * En la ficha del cliente, ¿la dirección es de ESTE proyecto? Con varios proyectos, `?tab=` dice cuál: la sesión de un
 * enlace no se busca en la exploración de otro. Fuera de un proyecto (la preventa) siempre lo es.
 */
export function esDeEsteProyecto(params: { get(n: string): string | null }, enProyecto: boolean, projectId: string | null): boolean {
  if (!enProyecto) return true;
  const tab = params.get("tab");
  return !tab || tab === projectId;
}

export interface LoQuePideLaDireccion {
  /** La clave con que se abre (la de ahora, aunque el enlace traiga la vieja de una reunión que entró sola). */
  sesion: string | null;
  momento: MomentoDeLaSesion | null;
  /** Pedía una sesión que ya no está en esta exploración: se abre el inicio y se avisa. */
  perdida: boolean;
}

/**
 * Qué sesión abre el lienzo con esta dirección: al abrir la página y al volver con «Atrás» o «Adelante». Nada si la
 * dirección es de otro proyecto de la ficha o si la pieza abierta no es Exploración (`enLaPieza`).
 */
export function sesionQuePideLaDireccion(
  params: { get(n: string): string | null },
  o: { sesiones: readonly SesionQueSeMuestra[]; enProyecto: boolean; projectId: string | null; enLaPieza?: boolean },
): LoQuePideLaDireccion {
  const nada = { sesion: null, momento: null, perdida: false };
  if (!esDeEsteProyecto(params, o.enProyecto, o.projectId) || o.enLaPieza === false) return nada;
  const d = sesionDeLaDireccion(params);
  const r = sesionPedida(d.sesion, o.sesiones);
  if (r.estado === "esta") return { sesion: r.clave, momento: d.momento, perdida: false };
  return r.estado === "no-esta" ? { ...nada, perdida: true } : nada;
}

/**
 * Cómo se escribe la dirección cuando cambia lo que se mira. Dentro de Exploración, elegir otra sesión, otra pestaña o
 * volver al inicio es un paso más del historial («Atrás» vuelve a lo anterior). La primera escritura (corregir el enlace
 * con que se llegó) y salir de la pieza reemplazan: no inventan un paso.
 */
export function modoDeEscritura(o: { primera: boolean; enLaPieza: boolean }): "agregar" | "reemplazar" {
  return o.primera || !o.enLaPieza ? "reemplazar" : "agregar";
}

export type DondeVive =
  | { lugar: "preventa"; exploracionId: string }
  | { lugar: "proyecto"; clientId: string; projectId: string };

// Solo para que `URL` arme la ruta; no sale de acá.
const ORIGEN_CUALQUIERA = "http://nexus.invalid";

/**
 * La ruta de la exploración (sin el dominio), con la sesión y su pestaña si se dan. Se arma de cero (no de la dirección de
 * ahora) para que no viaje nada de más y, en un proyecto, abra ESE proyecto aunque la empresa tenga otros.
 */
export function rutaDeLaSesion(donde: DondeVive, sesion: string | null, momento: MomentoDeLaSesion | null = null): string {
  const base =
    donde.lugar === "preventa"
      ? new URL(`/sales/exploraciones/${encodeURIComponent(donde.exploracionId)}?pieza=exploracion`, ORIGEN_CUALQUIERA)
      : new URL(`/clients/${encodeURIComponent(donde.clientId)}?tab=${encodeURIComponent(donde.projectId)}&canvas=exploration`, ORIGEN_CUALQUIERA);
  const u = conLaSesion(base, sesion, momento);
  return u.pathname + u.search;
}

/** El enlace para copiar: la ruta de la sesión con el dominio de quien la copia. */
export const enlaceDeLaSesion = (origen: string, donde: DondeVive, sesion: string, momento: MomentoDeLaSesion | null): string =>
  new URL(rutaDeLaSesion(donde, sesion, momento), origen).href;
