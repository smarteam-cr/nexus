/**
 * lib/landing/partner-stats.ts — de "+200 proyectos, +8 países LATAM" a fichas de número.
 *
 * La sección «Por qué Smarteam» pasó de cuatro tarjetas de texto a una banda de landing con
 * las credenciales en grande. El dato de experiencia, sin embargo, sigue siendo UN string
 * libre —así está guardado en las propuestas ya publicadas y así lo escribe el agente— y el
 * def lo declara fijo: "+200 proyectos, +8 países LATAM".
 *
 * Partirlo es presentación, no invención: cada fragmento se muestra COMPLETO, y lo único que
 * se decide es si su primer token es un número que merece ir en grande. Si no lo es, el
 * fragmento entero va como etiqueta y la ficha se ve sin número — nunca se recorta ni se
 * reordena lo que alguien escribió, porque esto se publica al cliente.
 */

export interface StatPartner {
  /** El número, para pintarlo grande. Vacío cuando el fragmento no arranca con uno. */
  valor: string;
  /** Lo que ese número cuenta — o el fragmento entero si no había número. */
  etiqueta: string;
}

/** Cuatro entran holgadas en la banda; con más, cada una se vuelve ilegible. */
const MAX_STATS = 4;

/** Coma, punto medio y barra: los tres separadores que aparecen escribiendo a mano. */
const SEPARADORES = /[,·|]/;

/**
 * El primer token como número: "+200", "8", "3.000", "+3,000", "95%". Se exige que después
 * venga algo — "+200" solo no es una ficha, es un número sin decir de qué.
 */
const NUMERO_Y_ETIQUETA = /^([+\-]?\d[\d.,]*\s*%?)\s+(.+)$/;

export function statsDeExperiencia(txt: string | null | undefined): StatPartner[] {
  return (txt ?? "")
    .split(SEPARADORES)
    .map((f) => f.trim())
    .filter(Boolean)
    .slice(0, MAX_STATS)
    .map((frag) => {
      const m = frag.match(NUMERO_Y_ETIQUETA);
      return m ? { valor: m[1].trim(), etiqueta: m[2].trim() } : { valor: "", etiqueta: frag };
    });
}
