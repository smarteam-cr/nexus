/**
 * lib/escala/documento/manual.ts — lo que la sección muestra del manual de operación. PURO.
 *
 * Cómo cambia la escala («Cómo cambia la escala», desde el manual 1.1.0; antes, «La escala está
 * congelada»): le da sentido a comentar. Se lee del manual PUBLICADO, como todo, y el título sale
 * del propio encabezado; si una versión lo reescribe distinto, la pantalla simplemente no lo muestra.
 */
import { lineasDe, parrafos, seccion } from "./parsear";

export interface ComoCambiaLaEscala {
  /** El encabezado tal cual: «Cómo cambia la escala». */
  titulo: string;
  /** «La escala cambia con el uso…». */
  resumen: string;
  /** Las reglas, con sus negritas de markdown. */
  reglas: string[];
}

/** El encabezado vigente y el de los manuales anteriores (1.0.x), que producción puede tener publicado. */
const ENCABEZADO = /^## (Cómo cambia la escala|La escala está congelada)\s*$/;

export function leerComoCambia(manual: string | null | undefined): ComoCambiaLaEscala | null {
  if (!manual) return null;
  const lineas = lineasDe(manual);
  const titulo = lineas.map((l) => ENCABEZADO.exec(l)?.[1]).find(Boolean);
  if (!titulo) return null;
  const bloque = seccion(lineas, ENCABEZADO);
  const reglas = bloque.map((l) => /^- (.+)$/.exec(l.trim())?.[1]).filter((x): x is string => !!x);
  const resumen = parrafos(bloque).find((p) => !p.startsWith("- ") && !p.endsWith(":")) ?? null;
  return resumen ? { titulo, resumen, reglas } : null;
}
