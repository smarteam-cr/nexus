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
 *
 * La INDUSTRIA también viaja en la dirección (27 oct): se elige al entrar, junto con el área, y decide la edición de las
 * preguntas. No es un dato de la persona (es una de la lista de Smarteam), así que puede quedar donde hay píxeles; un valor
 * que no es de la lista no se queda.
 */
import { INDUSTRIAS_DE_SMARTEAM } from "@/lib/clients/datos-de-la-empresa";


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

/** La industria de quien no encuentra la suya en la lista: el test va con la escala general. */
export const OTRA_INDUSTRIA = "Otra";

/** La industria que viene en la dirección, si es una de la lista de Smarteam (u «Otra»). Cualquier otra cosa, ninguna. */
export function industriaDelTest(v: string | string[] | undefined): string | null {
  const valor = primero(v)?.trim();
  if (!valor) return null;
  if (valor === OTRA_INDUSTRIA) return OTRA_INDUSTRIA;
  return INDUSTRIAS_DE_SMARTEAM.some((i) => i.valor === valor) ? valor : null;
}

/** La lista del campo «Industria» del formulario: la de Smarteam y «Otra» al final (se ve la etiqueta, se guarda el valor). */
export function industriasDelFormulario(): { valor: string; etiqueta: string }[] {
  return [...INDUSTRIAS_DE_SMARTEAM.map(({ valor, etiqueta }) => ({ valor, etiqueta })), { valor: OTRA_INDUSTRIA, etiqueta: OTRA_INDUSTRIA }];
}

/** Lo que se guarda («Consultoria») de lo que eligió la persona en el campo («Consultoría»); vacío si no es de la lista. */
export function valorDeLaIndustria(etiqueta: string): string {
  return industriasDelFormulario().find((i) => i.etiqueta === etiqueta)?.valor ?? "";
}

/** El nombre que se le muestra a la persona («Consultoría»), no el valor que se guarda («Consultoria»). */
export function etiquetaDeIndustria(valor: string): string {
  return INDUSTRIAS_DE_SMARTEAM.find((i) => i.valor === valor)?.etiqueta ?? valor;
}

/**
 * La consulta limpia de una página que entiende la industria: lo de campaña, la versión y la industria si es de la lista.
 * `limpia` = ya era así (si no, la página redirige a esta antes de armarse).
 */
export function consultaConIndustria(q: Consulta): { pasa: URLSearchParams; industria: string | null; limpia: boolean } {
  const industria = industriaDelTest(q.industria);
  const pasa = consultaLimpia(q);
  if (industria) pasa.set("industria", industria);
  return { pasa, industria, limpia: estaLimpia(q, ["industria"]) && (!primero(q.industria) || industria === q.industria) };
}
