/**
 * lib/clients/roles-de-persona.ts — el rol de una persona del cliente (R6; vocabulario del 25 nov). SIN IMPORTS a
 * propósito: lo leen la pantalla («Interlocutores») y el servidor, y lo que comparten los dos va a un módulo sin imports
 * (KNOWN-ERRORS, el build que se cayó el 25 nov por un import compartido).
 */
/**
 * El rol de una persona del cliente en el trabajo con Smarteam (Elías, 25 nov; reemplaza decide · influye · usa de R6,
 * que nadie había usado: 0 roles puestos en producción).
 */
export const ROLES_DE_PERSONA = ["decide", "champion", "participa", "no-involucrado"] as const;
export type RolDePersona = (typeof ROLES_DE_PERSONA)[number];
export const ETIQUETA_DEL_ROL: Record<RolDePersona, string> = {
  decide: "Decide",
  champion: "Champion",
  participa: "Participa",
  "no-involucrado": "No involucrado",
};
/** Lo que significa cada rol, para el globito de la pantalla. */
export const QUE_ES_EL_ROL: Record<RolDePersona, string> = {
  decide: "Aprueba y paga: la jefatura que decide.",
  champion: "Empuja el proyecto de su lado y está en casi todas las sesiones.",
  participa: "Va a las sesiones o usa lo que construimos.",
  "no-involucrado": "Está en la empresa (a veces en copia), pero no trabaja con nosotros.",
};
export const esRolDePersona = (x: unknown): x is RolDePersona => typeof x === "string" && (ROLES_DE_PERSONA as readonly string[]).includes(x);
