/**
 * lib/trivias/colores.ts — los colores de las opciones y del podio. Son DE LA TRIVIA, no del tema: no flipean en claro
 * u oscuro (como las fichas de un juego), y por eso van en hex literal y se aplican con `style`, no con clases.
 * Cada opción lleva además su letra: el color nunca es la única pista (daltonismo, proyector lavado).
 * El texto es blanco sobre los cuatro fondos con contraste AA para letra grande (≥ 4,5 : 1).
 */

export interface ColorDeOpcion {
  letra: string;
  fondo: string;
  texto: string;
}

export const COLORES_DE_OPCION: readonly ColorDeOpcion[] = [
  { letra: "A", fondo: "#6D4FD1", texto: "#FFFFFF" }, // violeta
  { letra: "B", fondo: "#0B7A7A", texto: "#FFFFFF" }, // turquesa
  { letra: "C", fondo: "#C2410C", texto: "#FFFFFF" }, // naranja
  { letra: "D", fondo: "#B42B6F", texto: "#FFFFFF" }, // magenta
];

export function colorDeOpcion(indice: number): ColorDeOpcion {
  return COLORES_DE_OPCION[indice % COLORES_DE_OPCION.length];
}

/** Oro, plata y bronce para el podio (1.º, 2.º y 3.º). */
export const COLORES_DEL_PODIO = [
  { fondo: "#C99A06", texto: "#FFFFFF" },
  { fondo: "#7B8794", texto: "#FFFFFF" },
  { fondo: "#A0612E", texto: "#FFFFFF" },
] as const;
