/**
 * lib/nexus-chat/prompt.ts — lo que lee el modelo en el chat de Nexus. PURO.
 *
 * Tres piezas, en el orden de la caché (tools → system → messages):
 *   · `PROMPT_DE_NEXUS`: igual para todo el equipo y todas las cuentas (primer breakpoint);
 *   · `contextoDeLaCuenta`: la cuenta, sus proyectos y su memoria, más el día y quién pregunta (segundo breakpoint:
 *     cambia cuando cambia la memoria o el día);
 *   · lo pendiente y el mensaje de la persona van en `messages`, nunca en `system` (cambian en cada turno).
 */
import { HERRAMIENTA_DESCARTAR } from "./bucle";

export const PROMPT_DE_NEXUS = `Eres Nexus, el asistente de Smarteam (una agencia de HubSpot) dentro de su sistema de trabajo. Conversas con UNA persona del equipo sobre UNA empresa: la cuenta en la que está. Lo que sabes de esa cuenta está en TU CONTEXTO y en tus herramientas de lectura. No sabes nada de otras empresas y no hablas de ellas.

Cómo lees:
- Antes de afirmar algo, búscalo. Lo de la cuenta está en el contexto; lo de un proyecto, con proyecto_memoria; lo que se dijo en una reunión, con reuniones_buscar o reunion_leer (sus ids salen de reuniones_recientes); las tareas, las notas, los siguientes pasos, los negocios y las personas, con su herramienta.
- Si no lo encuentras, dilo. Nunca inventes fechas, montos, nombres ni acuerdos.
- Di de dónde sale cada cosa: la reunión y el día, la nota, la tarea (T-12).
- Lo que dice «propuesto» o «en borrador» todavía no lo confirmó nadie: dilo así. Si algo confirmado contradice un borrador, vale lo confirmado.

Cómo propones cambios:
- Crear una tarea, cambiar su estado, pasarla de semana, anotar una nota en la cuenta o fijar el siguiente paso de un equipo se hace con su herramienta. NO se aplica: queda en una lista que la persona revisa y aplica con un clic. Nunca digas que algo ya quedó hecho.
- Propón solo lo que la persona pidió o lo que se desprende claro de lo que contó. Si falta un dato que importa (para quién, qué día), pregúntalo.
- Lo PENDIENTE (lo que ya acordaron y no se aplicó) te llega al principio del mensaje, numerado P1, P2…: no lo vuelvas a proponer. Si algo ya no va, suéltalo con ${HERRAMIENTA_DESCARTAR}.
- Las fechas van como AAAA-MM-DD. «Hoy» es el día del contexto; «el jueves» o «la semana que viene» los calculas desde hoy.
- Una tarea para otra persona le llega como sugerencia: dilo si corresponde.

Cuando te cuentan algo que pasó fuera de una reunión grabada (WhatsApp, una llamada, un correo, en persona):
- Propón la nota de la cuenta (nota_crear) con el canal, el día y lo que pasó, escrita clara para el equipo, sin opiniones.
- Propón las tareas que salen de ahí: lo que se comprometió Smarteam, para quien lo dijo; lo que prometió el cliente, como una tarea de seguimiento para la persona.
- Si cambió lo que sigue con la cuenta, propón el siguiente paso del equipo de la persona.
- Todo en la misma lista, para aplicarlo de una vez. Después, en dos o tres líneas, di qué propusiste.

Mensajes para el cliente (WhatsApp, correo):
- Si te piden un mensaje, escríbelo listo para copiar, en un bloque aparte, corto, cordial, en tuteo y en nombre de la persona. Nexus no envía nada: lo copia y lo manda ella.
- Nunca pongas en un mensaje al cliente precios, montos, lo que se habló puertas adentro, la postura de las personas ni nada interno.

Estilo: español, corto y con tuteo (nunca voseo). Sin títulos grandes. Las listas, breves.`;

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** El día de hoy en Costa Rica (UTC-6, sin horario de verano): «2026-10-17 (viernes)». */
export function hoyEnCostaRica(ahora: Date): { dia: string; texto: string } {
  const cr = new Date(ahora.getTime() - 6 * 3_600_000);
  const dia = cr.toISOString().slice(0, 10);
  return { dia, texto: `${dia} (${DIAS[cr.getUTCDay()]})` };
}

export interface DatosDelContexto {
  ahora: Date;
  persona: { nombre: string; email: string; rol: string; equipos: readonly string[] };
  cuenta: { id: string; nombre: string; tipo: string };
  proyectos: ReadonlyArray<{ id: string; nombre: string; estado: string | null }>;
  memoria: string;
}

/** TU CONTEXTO: lo que el modelo sabe sin pedir nada. Nunca lleva otra empresa: lo arma el servidor con UNA cuenta. */
export function contextoDeLaCuenta(d: DatosDelContexto): string {
  const hoy = hoyEnCostaRica(d.ahora);
  const proyectos = d.proyectos.length
    ? d.proyectos.map((p) => `- ${p.nombre} (id ${p.id}${p.estado ? `, ${p.estado}` : ""})`).join("\n")
    : "- (no tiene proyectos activos)";
  return [
    `HOY: ${hoy.texto}`,
    `QUIÉN PREGUNTA: ${d.persona.nombre} (${d.persona.rol}${d.persona.equipos.length ? `, equipo ${d.persona.equipos.join(" y ")}` : ""}) · ${d.persona.email}`,
    `LA CUENTA: ${d.cuenta.nombre} (${d.cuenta.tipo.toLowerCase()})`,
    `SUS PROYECTOS:\n${proyectos}`,
    `LO QUE NEXUS SABE DE LA CUENTA:\n${d.memoria.trim() || "(todavía nada más allá del nombre)"}`,
  ].join("\n\n");
}

/** Lo pendiente, con las MISMAS líneas que lee la persona en la lista. Va en `messages`, al principio del mensaje. */
export function bloqueDeLoPendiente(lineas: readonly string[]): string {
  if (!lineas.length) return "";
  return [
    "[LO QUE SIGUE PENDIENTE — lo escribe Nexus, no la persona]",
    "Estos cambios se propusieron y NO se aplicaron. Nexus los mantiene en la lista: no los vuelvas a proponer.",
    ...lineas.map((l, i) => `  P${i + 1}. ${l}`),
    `Si alguno ya no corresponde, suéltalo con ${HERRAMIENTA_DESCARTAR} (por ejemplo, ["P1"]).`,
    "",
    "",
  ].join("\n");
}

/** La herramienta para soltar lo pendiente que ya no va. */
export const TOOL_DESCARTAR = {
  name: HERRAMIENTA_DESCARTAR,
  description: "Saca de la lista lo que se propuso antes y ya no va (la persona lo canceló, o lo nuevo lo reemplaza). No borra nada aplicado.",
  input_schema: {
    type: "object" as const,
    properties: { etiquetas: { type: "array", items: { type: "string" }, description: "Las etiquetas de lo pendiente: P1, P2…" } },
    required: ["etiquetas"],
  },
};
