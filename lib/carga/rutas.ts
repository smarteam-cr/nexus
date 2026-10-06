/** lib/carga/rutas.ts — las direcciones de las pantallas de carga (un solo lugar para armarlas). */
export const RUTA_DE_LA_CARGA = "/customer-success/carga";
export const RUTA_DE_LOS_SUPUESTOS = "/customer-success/carga/supuestos";
export const RUTA_DE_LOS_DATOS = "/customer-success/carga/datos";
export const RUTA_DE_LA_RENTABILIDAD = "/customer-success/rentabilidad";
export const rutaDeLaUnoAUno = (id: string) => `/customer-success/carga/persona/${encodeURIComponent(id)}`;
