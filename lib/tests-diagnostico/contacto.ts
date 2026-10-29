/**
 * lib/tests-diagnostico/contacto.ts — EL CONTACTO QUE RECUERDA EL NAVEGADOR para «Diagnosticar otra área» (29 oct). PURO y
 * CLIENT-SAFE: recibe el almacenamiento (`localStorage` en la portada, uno de mentira en las pruebas).
 *
 * Como la aplicación vieja, que guardaba el contacto al empezar: el botón «Diagnosticar otra área» del resultado abre la
 * portada con los datos ya escritos; «Diagnosticar otra empresa» los borra, junto con lo que quedó a medias. Tres reglas:
 *   · solo se guardan los campos del formulario que describen a la persona y su empresa (nunca el área ni respuestas);
 *   · vencen a los 30 días: en una computadora compartida, la siguiente persona no hereda el contacto para siempre;
 *   · nunca viajan en la dirección: la portada carga píxeles de anuncios (./direccion-publica.ts).
 * Lo usa components/external/test/TestDelDiagnostico.tsx. Las pruebas: contacto.test.ts.
 */
import { VERSIONES_DEL_TEST } from "./tipos";
import { VALORES_VACIOS, type ValoresDelFormulario } from "./formulario";

export const CLAVE_DEL_CONTACTO = "nexus:test-diagnostico:contacto";
export const VIDA_DEL_CONTACTO_MS = 30 * 24 * 60 * 60 * 1000;
export const CAMPOS_DEL_CONTACTO = ["nombre", "apellido", "email", "dominio", "pais", "telefono", "crm", "industria"] as const;
export type Contacto = Pick<ValoresDelFormulario, (typeof CAMPOS_DEL_CONTACTO)[number]>;

/** Lo mínimo de `Storage` que hace falta. */
export type Almacen = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Dónde vive el token de un test a medias: uno por área y versión (el mismo que usa la portada). */
export const claveDelTestAMedias = (area: string, version: string) => `nexus:test-diagnostico:${area}:${version}`;

export function guardarContacto(almacen: Almacen, v: ValoresDelFormulario, ahora: number): void {
  try {
    const contacto = Object.fromEntries(CAMPOS_DEL_CONTACTO.map((k) => [k, v[k]]));
    almacen.setItem(CLAVE_DEL_CONTACTO, JSON.stringify({ ts: ahora, contacto }));
  } catch {
    // Sin almacenamiento (navegación privada): «otra área» sale con el formulario vacío.
  }
}

/** El contacto guardado, si no venció; un campo que no es texto vuelve a su valor vacío. */
export function leerContacto(almacen: Almacen, ahora: number): Contacto | null {
  try {
    const x = JSON.parse(almacen.getItem(CLAVE_DEL_CONTACTO) ?? "null") as { ts?: unknown; contacto?: Record<string, unknown> } | null;
    if (!x?.contacto || typeof x.ts !== "number" || ahora - x.ts > VIDA_DEL_CONTACTO_MS) return null;
    const c = x.contacto;
    return Object.fromEntries(CAMPOS_DEL_CONTACTO.map((k) => [k, typeof c[k] === "string" ? c[k] : VALORES_VACIOS[k]])) as Contacto;
  } catch {
    return null;
  }
}

/** «Diagnosticar otra empresa»: el contacto y los tests a medias de todas las áreas, en las dos versiones. */
export function olvidarLaEmpresa(almacen: Almacen, areas: readonly string[]): void {
  for (const clave of [CLAVE_DEL_CONTACTO, ...areas.flatMap((a) => VERSIONES_DEL_TEST.map((v) => claveDelTestAMedias(a, v)))]) {
    try {
      almacen.removeItem(clave);
    } catch {
      // nada
    }
  }
}
