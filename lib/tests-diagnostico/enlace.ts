/**
 * lib/tests-diagnostico/enlace.ts — LA DIRECCIÓN DEL RESULTADO del test nuevo. PURO.
 *
 * La preventa y «Llegaron por el test» leen el resultado del test desde la dirección que queda en HubSpot (la propiedad
 * `url_ultimo_diag_*` del contacto y el enlace de la nota), sin base (lib/exploraciones/test-de-marketing.ts). Para no
 * romper esa lectura, la dirección del test nuevo hace lo mismo que la vieja: después del `#` lleva el resultado
 * comprimido (lz-string), ahora con la escala de HOY (`v: 2`, las dimensiones por su id y su letra). Antes del `#` va la
 * página del resultado en Nexus (`/external/test/resultado/<token>`), que lo lee de la base.
 *
 * Los enlaces viejos (`resultado.html#…`, `v: 1`) se siguen leyendo igual (O6 etapa 1).
 */
import { compressToEncodedURIComponent } from "lz-string";
import type { Letra } from "@/lib/escala/documento/tipos";

/** La ruta pública del resultado. */
export const RUTA_DEL_RESULTADO = "/external/test/resultado";

/** ¿La dirección es la de un resultado del test nuevo? (para quien busca el enlace en una nota). */
export const PATRON_DEL_RESULTADO_NUEVO = /\/external\/test\/resultado\/[A-Za-z0-9_-]+#/;

export interface DatosDelEnlace {
  areaId: string;
  /** AAAA-MM-DD. */
  fecha: string;
  dimensiones: { id: string; nivel: Letra; respuesta: string | null; matiz: string | null }[];
}

/** La dirección completa del resultado, con los datos después del `#`. */
export function urlDelResultado(base: string, token: string, datos: DatosDelEnlace): string {
  const cuerpo = {
    v: 2,
    area: datos.areaId,
    fecha: datos.fecha,
    dims: Object.fromEntries(datos.dimensiones.map((d) => [d.id, d.nivel])),
    qa: datos.dimensiones.map((d) => ({ dim: d.id, respuesta: d.respuesta, matiz: d.matiz })),
  };
  return `${base.replace(/\/+$/, "")}${RUTA_DEL_RESULTADO}/${token}#${compressToEncodedURIComponent(JSON.stringify(cuerpo))}`;
}
