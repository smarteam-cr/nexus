/**
 * lib/impacto/escalera.ts — LA ESCALERA DE PESO del contexto (Elías, 20 y 21 nov). PURO y client-safe.
 *
 * Cuando dos cosas que sabe Nexus no cuadran, gana la de más arriba. Lo leen el agente de impacto (./impacto.ts), el
 * Resumen de La escala y, después, cualquier entregable que se enchufe (kickoff, handoff, entrega, sesiones de consenso)
 * y la puerta única «hablar con Nexus».
 *
 *   1. Aceptado por el cliente: respondió «lo acepto» (o «con cambios», con su nota) a algo que se le presentó.
 *   2. Presentado y no corregido: se le presentó y todavía no respondió nada en contra.
 *   3. Confirmado por el equipo: lo escribió una persona del equipo de Smarteam, con quién y cuándo.
 *   4. Dicho por el cliente en una reunión: con su cita.
 *   5. Deducido por Nexus: lo que el agente leyó o calculó sin que nadie lo confirmara.
 *
 * Lo nuevo de un peso más alto manda; lo nuevo de un peso más bajo NO pisa en silencio lo de arriba: se avisa (por
 * ejemplo, «Esto contradice lo que el cliente aceptó el 18 nov»).
 */

export const ESCALERA_DE_PESO = ["aceptado", "presentado", "equipo", "reunion", "deducido"] as const;
export type PesoDelContexto = (typeof ESCALERA_DE_PESO)[number];

export const NOMBRE_DEL_PESO: Record<PesoDelContexto, string> = {
  aceptado: "Aceptado por el cliente",
  presentado: "Presentado al cliente y no corregido",
  equipo: "Confirmado por el equipo",
  reunion: "Dicho por el cliente en una reunión",
  deducido: "Deducido por Nexus",
};

/** Cuánto pesa (más alto, más manda): 5 el aceptado, 1 lo deducido. */
export function pesoDe(p: PesoDelContexto): number {
  return ESCALERA_DE_PESO.length - ESCALERA_DE_PESO.indexOf(p);
}

/** ¿`a` manda sobre `b`? Con el mismo peso, manda lo más nuevo (lo decide quien compara, no la escalera). */
export function mandaSobre(a: PesoDelContexto, b: PesoDelContexto): boolean {
  return pesoDe(a) > pesoDe(b);
}

/** La escalera en palabras, para un prompt. */
export function escaleraParaElAgente(): string {
  return ESCALERA_DE_PESO.map((p, i) => `${i + 1}. ${NOMBRE_DEL_PESO[p]}`).join("\n");
}
