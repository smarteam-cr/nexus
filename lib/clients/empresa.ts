/**
 * lib/clients/empresa.ts — LA EMPRESA ARRIBA DE SUS UNIDADES (2026-11-26). PURO y client-safe.
 *
 * Una empresa con dos o más unidades de negocio (TEC: AE y TAE; Cemaco: Costa Rica y Ecuador; Grupo Teamnet) es una
 * ficha `Client` con `kind = "EMPRESA"`. Guarda lo que comparten sus unidades (el dominio compartido y la empresa de
 * HubSpot compartida) y NUNCA tiene trabajo: ni reuniones, ni proyectos de trabajo, ni documentos, ni cobranza. Las
 * unidades le cuelgan por `comparteDominioConId`, todas iguales. DECISIONS «La empresa arriba de sus unidades».
 *
 * Este módulo dice si una ficha es una empresa y frena a quien quiera crearle trabajo. La regla de a qué unidad va una
 * reunión o una fila de HubSpot vive en el resolver único (lib/sessions/categorize.ts, invariante 2).
 */

/** ¿Esta ficha es una empresa (la que está arriba de sus unidades)? */
export const esEmpresa = (c: { kind?: string | null } | null | undefined): boolean => c?.kind === "EMPRESA";

/** El texto con que se frena a quien quiere crearle trabajo a una empresa. */
export const NO_SE_TRABAJA_EN_LA_EMPRESA =
  "Esta ficha es la empresa: el trabajo vive en sus unidades de negocio. Elige la unidad que corresponde.";

/** Lo que devuelve `rechazarSiEsEmpresa`: null si se puede seguir. */
export type RechazoDeLaEmpresa = { status: 409; error: string } | null;

/**
 * Para los que CREAN trabajo en una ficha (un proyecto, una preventa, una propuesta, una cuenta de cobro, una reunión
 * asignada a mano): null si la ficha no es una empresa; si lo es, el 409 con el texto para la pantalla. Lo vigila
 * `lib/clients/empresa.test.ts` (escaneo de los que crean).
 */
export function rechazarSiEsEmpresa(c: { kind?: string | null } | null | undefined): RechazoDeLaEmpresa {
  return esEmpresa(c) ? { status: 409, error: NO_SE_TRABAJA_EN_LA_EMPRESA } : null;
}
