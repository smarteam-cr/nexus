/**
 * lib/escala/radar.ts — la vista «Radar» de la escala: de cada dimensión, dónde se concentra cada cosa. PURO.
 *
 * El mapa pinta cada celda (dimensión × nivel) como un sector de la rueda; el radar dice lo mismo con
 * PUNTOS (pedido de Elías, 2026-10-28: «por puntos, no por áreas»). Un eje por dimensión, un anillo por
 * nivel, y en cada eje un punto por serie: el nivel promedio de los criterios de esa clase en esa
 * dimensión. «Criterios» dice dónde pesa la dimensión; «Riesgos», dónde están sus riesgos; «Hábitos»,
 * desde dónde se pide repetir… La página es la escala de referencia, sin empresa: ningún punto es «dónde
 * está» alguien.
 *
 * Con el perfil de negocio cuentan solo los criterios que aplican (la regla de `aplica`, como en las otras
 * vistas), y una dimensión que no aplica no tiene punto. «Escondidos por el perfil» es lo contrario: lo
 * que el perfil saca, y solo existe con un perfil elegido.
 */
import { aplica, dimensionAplica, type Perfil } from "./documento/perfil";
import { enlacesQueAplican } from "./documento/requeridos";
import { LETRAS, type Area, type Criterio, type Letra } from "./documento/tipos";
import type { RequeridosDelArea } from "./vista";

export type SerieDelRadar = "criterios" | "habitos" | "riesgos" | "requeridos" | "escondidos";

/**
 * En el orden en que se ofrecen. Cada una con su color FIJO: sigue a la serie, nunca a cuántas están prendidas.
 * Las series conviven en el mismo dibujo, así que se validó cada PAR (claro y oscuro, con el validador de la guía
 * de gráficos): azul, magenta y amarillo pasan; el naranja se confunde con los dos, y el aqua y el verde con la
 * línea punteada de Funcional (verde, como en el mapa). Requeridos va en tinta y los escondidos, lo que el perfil
 * saca, en gris y huecos: las dos con su forma propia.
 */
export const SERIES_DEL_RADAR: readonly {
  clave: SerieDelRadar;
  etiqueta: string;
  queCuenta: string;
  color: string;
}[] = [
  {
    clave: "criterios",
    etiqueta: "Criterios",
    queCuenta: "criterios",
    color: "var(--color-serie-1)",
  },
  {
    clave: "habitos",
    etiqueta: "Hábitos",
    queCuenta: "hábitos",
    color: "var(--color-serie-5)",
  },
  {
    clave: "riesgos",
    etiqueta: "Riesgos",
    queCuenta: "criterios de riesgo",
    color: "var(--color-serie-4)",
  },
  {
    clave: "requeridos",
    etiqueta: "Requeridos",
    queCuenta: "criterios que otros requieren",
    color: "var(--color-fg)",
  },
  {
    clave: "escondidos",
    etiqueta: "Escondidos por el perfil",
    queCuenta: "criterios escondidos por el perfil",
    color: "var(--color-fg-muted)",
  },
];

/**
 * Las que se ven al entrar: dónde pesa cada dimensión y desde dónde se pide repetir. Riesgos no: sus criterios son, por
 * definición, los que hay que cumplir para pasar a Eficiente, así que su punto cae siempre en Funcional.
 */
export const SERIES_DE_ENTRADA: readonly SerieDelRadar[] = ["criterios", "habitos"];

/** Lo que se sabe de una serie en una dimensión. `valor` (1 a 5) es null si no hay ningún criterio de esa clase. */
export interface PuntoDelRadar {
  valor: number | null;
  cuantos: number;
  porNivel: Record<Letra, number>;
}

export interface EjeDelRadar {
  dimensionId: string;
  nombre: string;
  /** Con el perfil elegido: si no aplica, sus series (salvo «escondidos») van sin punto. */
  aplica: boolean;
  series: Record<SerieDelRadar, PuntoDelRadar>;
}

function punto(criteriosPorNivel: [Letra, Criterio[]][], cuenta: (c: Criterio) => boolean): PuntoDelRadar {
  const porNivel = Object.fromEntries(LETRAS.map((l) => [l, 0])) as Record<Letra, number>;
  for (const [letra, criterios] of criteriosPorNivel) porNivel[letra] += criterios.filter(cuenta).length;
  const cuantos = LETRAS.reduce((s, l) => s + porNivel[l], 0);
  const suma = LETRAS.reduce((s, l, i) => s + porNivel[l] * (i + 1), 0);
  return { valor: cuantos ? suma / cuantos : null, cuantos, porNivel };
}

const VACIO: PuntoDelRadar = {
  valor: null,
  cuantos: 0,
  porNivel: { D: 0, I: 0, F: 0, E: 0, O: 0 },
};

/** Un eje por dimensión, en el orden de la escala (el de la matriz y el mapa). */
export function ejesDelRadar(area: Pick<Area, "dimensiones">, perfil: Perfil, requeridos: RequeridosDelArea): EjeDelRadar[] {
  const conPerfil = !!(perfil.cierre || perfil.despues || perfil.trafico);
  return area.dimensiones.map((d) => {
    const porNivel = d.niveles.map((n) => [n.letra, n.criterios] as [Letra, Criterio[]]);
    const siAplica = dimensionAplica(d, perfil);
    const visible = (c: Criterio) => siAplica && aplica(c, perfil);
    return {
      dimensionId: d.id,
      nombre: d.nombre,
      aplica: siAplica,
      series: {
        criterios: punto(porNivel, visible),
        habitos: punto(porNivel, (c) => visible(c) && c.habito),
        riesgos: punto(porNivel, (c) => visible(c) && c.riesgo),
        requeridos: punto(porNivel, (c) => visible(c) && enlacesQueAplican(requeridos.loRequieren[c.id], perfil).length > 0),
        escondidos: conPerfil ? punto(porNivel, (c) => !aplica(c, perfil)) : VACIO,
      },
    };
  });
}

/** Las series que se pueden prender: «Escondidos por el perfil» solo con un perfil elegido. */
export function seriesDisponibles(perfil: Perfil): SerieDelRadar[] {
  const conPerfil = !!(perfil.cierre || perfil.despues || perfil.trafico);
  return SERIES_DEL_RADAR.map((s) => s.clave).filter((s) => s !== "escondidos" || conPerfil);
}

/** El nivel al que queda más cerca un promedio: 2,4 → Inicial; 2,5 → Funcional. */
export function nivelMasCercano(valor: number): Letra {
  const i = Math.min(LETRAS.length, Math.max(1, Math.round(valor))) - 1;
  return LETRAS[i];
}

/**
 * El nivel donde más criterios tiene una serie (si empatan, el más cercano al promedio): el que se describe en el
 * panel. Nunca un nivel donde la serie no tiene ninguno. null sin criterios.
 */
export function nivelConMas(p: PuntoDelRadar): Letra | null {
  if (p.valor === null || p.cuantos === 0) return null;
  const valor = p.valor;
  const maximo = Math.max(...LETRAS.map((l) => p.porNivel[l]));
  const empatados = LETRAS.filter((l) => p.porNivel[l] === maximo);
  return empatados.reduce((mejor, l) => (Math.abs(LETRAS.indexOf(l) + 1 - valor) < Math.abs(LETRAS.indexOf(mejor) + 1 - valor) ? l : mejor));
}

/**
 * Cómo se nombra un promedio: «Funcional» si cae en el anillo, «cerca de Eficiente» si cae entre dos. Un 3,7
 * puede salir de dos criterios en Funcional y uno en Óptimo, sin ninguno en Eficiente: decir «Eficiente» a
 * secas engañaría.
 */
export function nombreDelPromedio(valor: number, nombreNivel: (l: Letra) => string): string {
  const nombre = nombreNivel(nivelMasCercano(valor));
  return Math.abs(valor - Math.round(valor)) < 0.15 ? nombre : `cerca de ${nombre}`;
}

// ── Geometría ────────────────────────────────────────────────────────────────
// Grados de reloj: 0 = arriba, en el sentido de las agujas (como el mapa). La primera dimensión, arriba.

/** El ángulo del eje `i` de `n`. */
export function anguloDelEje(i: number, n: number): number {
  return (i * 360) / n;
}

/** De un nivel (1 = Deficiente … 5 = Óptimo, o un promedio entre ellos) al radio: cada anillo a la misma distancia. */
export function radioDelNivel(valor: number, radioMaximo: number): number {
  const v = Math.min(LETRAS.length, Math.max(0, valor));
  return (v / LETRAS.length) * radioMaximo;
}

/** Grados de reloj y radio → coordenadas del SVG (la y crece hacia abajo). */
export function aCoordenadas(cx: number, cy: number, grados: number, r: number): [number, number] {
  const rad = (grados * Math.PI) / 180;
  return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
}

/**
 * Por dónde va la línea de una serie: los puntos que existen, unidos con sus vecinos. Con todos, un
 * polígono cerrado; si a alguno le falta, tramos abiertos (la línea no salta por encima de un eje sin
 * punto). Un punto sin vecinos queda solo, sin línea.
 */
export function tramosDelRadar<T>(puntos: (T | null)[]): { cerrado: boolean; puntos: T[] }[] {
  const n = puntos.length;
  if (n === 0) return [];
  if (puntos.every((p) => p !== null)) return [{ cerrado: true, puntos: puntos as T[] }];
  const primerHueco = puntos.findIndex((p) => p === null);
  const tramos: { cerrado: boolean; puntos: T[] }[] = [];
  let actual: T[] = [];
  // Se recorre desde el primer hueco para que un tramo que cruza el final del arreglo quede entero.
  for (let k = 1; k <= n; k++) {
    const p = puntos[(primerHueco + k) % n];
    if (p === null) {
      if (actual.length >= 2) tramos.push({ cerrado: false, puntos: actual });
      actual = [];
    } else actual.push(p);
  }
  return tramos;
}
