/**
 * lib/cs/ficha-reglas.ts — el «Estado de la cuenta» de la ficha: cuatro lecturas, cada una con una
 * palabra y su porqué (2026-10-04). PURO.
 *
 * Entrega · Uso · Relación · Renovación. Salen de la MISMA cuenta armada que usa el índice
 * (`CuentaDeCartera`), así la ficha y la lista de la semana no pueden contradecirse.
 *
 * Desde el 2026-10-07 el código vive en lib/cs/cartera-reglas.ts: el color de salud de cada cuenta
 * en el índice sale de estas lecturas (`saludDeLaCuenta`) y cartera-reglas no podía importar este
 * archivo, que importa de ella. Acá queda la puerta de siempre.
 */
export {
  estadoDeLaCuenta,
  porQueNoHayUso,
  renovacionDeLaFicha,
  type ColorDeLectura,
  type HubDeLaRenovacion,
  type Lectura,
  type MontosPorMoneda,
  type RenovacionDeLaFicha,
} from "./cartera-reglas";
