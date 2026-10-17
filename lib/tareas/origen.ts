/**
 * lib/tareas/origen.ts — de dónde viene una tarea, dicho para una persona. CLIENT-SAFE y puro.
 *
 * Toda tarea dice de dónde salió (ficha A del roadmap, 2026-10-17): de una reunión con el cliente, del sprint interno
 * del equipo, de HubSpot o a mano. Lo de una reunión se decide por la SALA (quién estuvo), nunca por el cliente de la
 * tarea: una reunión de puertas adentro es el sprint del equipo aunque la tarea sea de un cliente. La sala la calcula
 * `salasDeReuniones` (lib/sessions/reuniones-para-tareas.ts) para la cita; acá solo se lee `puertasAdentro`, que no
 * revela nada que la tarjeta de la cita no diga ya («Salió de una reunión con un cliente» / «… del equipo»).
 */

export type ClaveDeOrigen = "reunion_cliente" | "sprint" | "reunion" | "hubspot" | "chat" | "paso" | "plantilla" | "mano";

export interface OrigenVisible {
  clave: ClaveDeOrigen;
  etiqueta: string;
}

const ETIQUETA: Record<ClaveDeOrigen, string> = {
  reunion_cliente: "Reunión con el cliente",
  sprint: "Sprint interno",
  reunion: "Notas de una reunión",
  hubspot: "HubSpot",
  chat: "Chat de Nexus",
  paso: "Siguiente paso",
  plantilla: "Plantilla",
  mano: "A mano",
};

/** El orden en que se agrupan los orígenes (lo que viene del cliente primero). */
export const ORDEN_DE_ORIGEN: readonly ClaveDeOrigen[] = ["reunion_cliente", "sprint", "reunion", "hubspot", "paso", "chat", "plantilla", "mano"];

export function etiquetaDeOrigen(clave: ClaveDeOrigen): string {
  return ETIQUETA[clave];
}

/**
 * De dónde viene una tarea. `origen` es la columna (`mano | pedido | reunion | notas | chat | plantilla | hubspot |
 * paso`); `sala` es la de su reunión, si la tiene y se pudo leer.
 */
export function origenDeLaTarea(t: { origen: string; sessionId: string | null }, sala: { puertasAdentro: boolean } | null | undefined): OrigenVisible {
  const clave = claveDeOrigen(t, sala);
  return { clave, etiqueta: ETIQUETA[clave] };
}

function claveDeOrigen(t: { origen: string; sessionId: string | null }, sala: { puertasAdentro: boolean } | null | undefined): ClaveDeOrigen {
  switch (t.origen) {
    case "reunion":
    case "notas":
      if (sala) return sala.puertasAdentro ? "sprint" : "reunion_cliente";
      return "reunion";
    case "hubspot":
      return "hubspot";
    case "chat":
      return "chat";
    case "paso":
      return "paso";
    case "plantilla":
      return "plantilla";
    default:
      return "mano";
  }
}
