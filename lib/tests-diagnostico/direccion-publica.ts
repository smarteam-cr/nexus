/**
 * lib/tests-diagnostico/direccion-publica.ts — QUÉ SE QUEDA EN LA DIRECCIÓN de las páginas públicas del test (O6,
 * 2026-10-26). PURO.
 *
 * Esas páginas cargan los píxeles de anuncios (./pixeles.ts), y un píxel manda la dirección entera a Meta, a Google o a
 * HubSpot. La app vieja recibía enlaces con los datos de la persona (`?area=ventas&email=…&nombre=…`, desde otros
 * formularios). Por eso la página solo se arma con una dirección LIMPIA: lo que mide la campaña y la versión. Si trae
 * cualquier otra cosa, el servidor redirige a la misma página sin ella, antes de que cargue ningún píxel. Y lo que mide la
 * campaña es lo que pasa de la entrada (`/external/test`) a la página del área: si se pierde ahí, las campañas dejan de
 * atribuir sin que nada falle.
 */

/** Lo que mide una campaña: Google, Meta, Microsoft, LinkedIn y los correos y anuncios de HubSpot. */
const DE_CAMPANA = /^(utm_[a-z_]{1,20}|gclid|gbraid|wbraid|fbclid|msclkid|li_fat_id|hsa_[a-z_]{1,20}|_hsenc|_hsmi|__hstc|__hssc|__hsfp)$/;

export type Consulta = Record<string, string | string[] | undefined>;

const primero = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Lo que se queda de la consulta: lo de campaña y la versión (`v`), cada uno una vez y de hasta 300 caracteres. `extra`
 * suma claves que esa página entiende (la entrada lee `area`).
 */
export function consultaLimpia(q: Consulta, extra: readonly string[] = []): URLSearchParams {
  const limpia = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    const valor = primero(v);
    if (!valor) continue;
    if (DE_CAMPANA.test(k) || k === "v" || extra.includes(k)) limpia.set(k, valor.slice(0, 300));
  }
  return limpia;
}

/** ¿La consulta ya está limpia? Si no, la página redirige a la versión limpia antes de armarse. */
export function estaLimpia(q: Consulta, extra: readonly string[] = []): boolean {
  const limpia = consultaLimpia(q, extra);
  const claves = Object.entries(q).filter(([, v]) => primero(v));
  return claves.length === [...limpia.keys()].length && claves.every(([k, v]) => !Array.isArray(v) && limpia.get(k) === v);
}

/** `?…` o vacío. */
export const sufijo = (p: URLSearchParams) => (p.size ? `?${p.toString()}` : "");
