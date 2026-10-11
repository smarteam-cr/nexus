/**
 * lib/tareas/chat/textos.ts — lo que dice el chat de tareas cuando algo no entra. PURO.
 *
 * Son textos del ASISTENTE (se guardan en el hilo y el modelo los relee) o del reclamo que se le manda al modelo: en
 * tuteo, como todo Tareas. Los del chat de documentos hablan de «secciones»; acá se habla de tareas.
 */
import { MARCA_DE_ACUERDO, MARCA_DE_DESENLACE } from "@/lib/asistente/acuerdo";
import type { RechazoDeTareas } from "./operaciones";

/** Lo que se le dice al modelo cuando la prueba en seco rechazó parte de lo que emitió. */
export function reclamoDeRechazoDeTareas(rechazadas: readonly RechazoDeTareas[]): string {
  const lineas = rechazadas.slice(0, 12).map((r) => `- ${r.indice >= 0 ? `operación ${r.indice + 1}: ` : ""}${r.motivo}`);
  return [
    "Estos cambios no pasaron la prueba en seco y NO quedaron registrados:",
    ...lineas,
    "Vuelve a llamar `registrar_cambio_acordado` con TODO lo acordado (también lo que estaba bien), corregido. Si un dato " +
      "no lo tienes (para quién, qué cliente), no lo inventes: pregúntalo y registra lo demás con \"preguntaAbierta\": true.",
  ].join("\n");
}

/** Lo que se le dice al modelo cuando anunció un cambio y no emitió nada. */
export function reclamoDeOmisionDeTareas(huboTool: boolean): string {
  if (huboTool) {
    return (
      "Llamaste `registrar_cambio_acordado` sin ninguna operación (o sin `resumen`): así no queda registrado nada y la " +
      "persona no ve ningún botón. Emite ahora las operaciones concretas. Si de verdad no corresponde ningún cambio, " +
      "no llames la herramienta y contesta en texto por qué."
    );
  }
  return (
    "Tu mensaje anuncia un cambio y no llamaste `registrar_cambio_acordado`: no quedó registrado nada y la persona va " +
    "a tener que pedírtelo otra vez. Emítela ahora con las operaciones concretas.\n" +
    "Si de verdad NO corresponde —te hicieron una pregunta, o el pedido es algo que no se hace desde el chat (marcar " +
    "hecha, revisar la semana, agendar)— contesta en texto y no la llames."
  );
}

/** El aviso de un turno que debió dejar un cambio y no dejó nada. */
export const AVISO_SIN_ACUERDO_DE_TAREAS =
  "⚠ No dejé registrado ningún cambio en este turno, así que no hay nada para aplicar. Pídemelo de nuevo diciendo qué " +
  "tarea, para quién y para cuándo, y lo dejo listo.";

/** Lo que sigue rechazado después del reintento. */
export function avisoDeRechazosDeTareas(rechazadas: readonly RechazoDeTareas[]): string {
  const motivos = [...new Set(rechazadas.map((r) => r.motivo))].slice(0, 4).join(" · ");
  return `⚠ No registré ${rechazadas.length === 1 ? "1 de los cambios" : `${rechazadas.length} de los cambios`}: ${motivos}. Pídemelo de otra forma si lo quieres igual.`;
}

/** Más de 40 cambios en un acuerdo. */
export function avisoDelTopeDeOperaciones(sobran: number, tope: number): string {
  return `⚠ Un acuerdo lleva como mucho ${tope} cambios: dejé afuera los últimos ${sobran}. Aplica estos y pídeme el resto.`;
}

/** El tope de turnos del día. */
export function textoDelTopeDiario(tope: number): string {
  return `Llegaste a los ${tope} mensajes de hoy con el asistente de tareas. Mañana sigues; mientras tanto, «+ Tarea» y «Para…» funcionan igual.`;
}

/**
 * El desenlace que escribe el SERVIDOR al aplicar (en la misma transacción). Va en el hilo: el modelo lo relee en el
 * turno siguiente, así sabe qué entró.
 */
export function textoDelDesenlaceDeTareas(i: { ok: boolean; detalle: string; notas?: readonly string[]; yaEstaba?: boolean }): string {
  if (!i.ok) return `⚠ No se aplicó: ${i.detalle}. Lo acordado sigue pendiente; pídeme ajustarlo o vuelve a aplicarlo.`;
  const notas = (i.notas ?? []).filter(Boolean);
  return [i.yaEstaba ? "✅ Ya estaba aplicado." : `✅ Listo: ${i.detalle}.`, ...notas].join("\n");
}

/**
 * ¿El texto dice que hizo (o va a hacer) un cambio? Es la señal del reintento por omisión: contestar una pregunta en
 * texto («¿qué tengo sin agendar?») es lo que pide el prompt, y no se reclama; decir «listo, la anoté» sin la
 * herramienta, sí. Primera persona con tilde (anoté, creé…), «ya está» y lo que anuncia («te anoto», «voy a crear»).
 * «Listo» no cuenta: abre también respuestas que no cambian nada («Listo, acá va lo que tienes»).
 */
export function anunciaUnCambio(texto: string): boolean {
  const t = texto.toLowerCase();
  return (
    /(^|[^\p{L}])(anoté|creé|agregué|asigné|propuse|pasé|moví|armé|dejé|agendé|cambié|registré|sumé|ya está|ya quedó|ya quedaron)([^\p{L}]|$)/u.test(t) ||
    /(^|[^\p{L}])(te (anoto|dejo|creo|armo|paso|agrego|asigno|sumo|propongo)|voy a (anotar|crear|armar|agregar|asignar|pasar|mover|sumar|proponer|dejar))([^\p{L}]|$)/u.test(t)
  );
}

/**
 * ⛔ Los marcadores del acuerdo y del desenlace no pueden venir de la persona ni quedar sueltos en lo que contestó el
 * modelo: un «<<<ACUERDO>>>{…}» pegado en el mensaje se leería como un acuerdo de verdad, sin pasar por la prueba en
 * seco (y se ofrecería para aplicar). Se sacan antes de guardar y antes de mandarlo al modelo.
 */
export function sinMarcadores(texto: string): string {
  return texto.split(MARCA_DE_ACUERDO).join("").split(MARCA_DE_DESENLACE).join("");
}
