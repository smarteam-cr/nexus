/**
 * lib/tareas/origen.ts — de dónde viene una tarea, dicho para una persona. CLIENT-SAFE y puro.
 *
 * Toda tarea dice de dónde salió (ficha A del roadmap, 2026-10-17): de una reunión con el cliente, del sprint interno
 * del equipo, de HubSpot o a mano. Lo de una reunión se decide por la SALA (quién estuvo), nunca por el cliente de la
 * tarea: una reunión de puertas adentro es el sprint del equipo aunque la tarea sea de un cliente. La sala la calcula
 * `salasDeReuniones` (lib/sessions/reuniones-para-tareas.ts) para la cita; acá solo se lee `puertasAdentro`, que no
 * revela nada que la tarjeta de la cita no diga ya («Salió de una reunión con un cliente» / «… del equipo»).
 */

export type ClaveDeOrigen = "reunion_cliente" | "sprint" | "reunion" | "correo" | "hubspot" | "chat" | "paso" | "plantilla" | "mano";

export interface OrigenVisible {
  clave: ClaveDeOrigen;
  etiqueta: string;
}

const ETIQUETA: Record<ClaveDeOrigen, string> = {
  reunion_cliente: "Reunión con el cliente",
  sprint: "Sprint interno",
  reunion: "Notas de una reunión",
  correo: "Correo con el cliente",
  hubspot: "HubSpot",
  chat: "Chat de Nexus",
  paso: "Siguiente paso",
  plantilla: "Plantilla",
  mano: "A mano",
};

/** El orden en que se agrupan los orígenes (lo que viene del cliente primero). */
export const ORDEN_DE_ORIGEN: readonly ClaveDeOrigen[] = ["reunion_cliente", "correo", "sprint", "reunion", "hubspot", "paso", "chat", "plantilla", "mano"];

export function etiquetaDeOrigen(clave: ClaveDeOrigen): string {
  return ETIQUETA[clave];
}

/**
 * De dónde viene una tarea. `origen` es la columna (`mano | pedido | reunion | notas | chat | plantilla | hubspot |
 * paso | correo`); `sala` es la de su reunión, si la tiene y se pudo leer.
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
    case "correo":
      return "correo";
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

/**
 * «Estuvieron Lidia, Andrés y 2 de afuera» (P5, 2026-10-27): quiénes estuvieron en la reunión de la que salió la tarea.
 * Solo los nombres de la casa; de afuera, cuántos (sus correos no salen de la reunión).
 */
export function textoDeQuienesEstuvieron(e: { nombres: readonly string[]; deAfuera: number }): string {
  const afuera = e.deAfuera === 1 ? "1 de afuera" : e.deAfuera > 1 ? `${e.deAfuera} de afuera` : null;
  const partes = [...e.nombres.slice(0, 4), ...(e.nombres.length > 4 ? [`${e.nombres.length - 4} más de la casa`] : []), ...(afuera ? [afuera] : [])];
  if (!partes.length) return "";
  const lista = partes.length === 1 ? partes[0]! : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
  return `Estuvieron ${lista}`;
}
