/** lib/carga/rutas.ts — las direcciones de las pantallas de carga (un solo lugar para armarlas). */
export const RUTA_DE_LA_CARGA = "/customer-success/carga";
export const RUTA_DE_LOS_SUPUESTOS = "/customer-success/carga/supuestos";
export const RUTA_DE_LOS_DATOS = "/customer-success/carga/datos";
export const RUTA_DE_LA_RENTABILIDAD = "/customer-success/rentabilidad";
export const rutaDeLaUnoAUno = (id: string) => `/customer-success/carga/persona/${encodeURIComponent(id)}`;
/** «Tu carga»: la de quien la abre (2026-10-07). Fuera de /customer-success: la abren el CSE y la CSL. */
export const RUTA_DE_TU_CARGA = "/tu-carga";
/** El margen de una cuenta, mes a mes (Rentabilidad, solo dirección). */
export const rutaDelMargenDeLaCuenta = (clientId: string) => `/customer-success/rentabilidad/cuenta/${encodeURIComponent(clientId)}`;
