/**
 * lib/tareas/chat/prompt.ts — lo que lee el modelo en el chat de tareas (docs/tareas-plan.md §6.2): su cabeza y su
 * cola PROPIAS (no el tronco del cronograma, que habla de «UN documento de UN proyecto»), y la herramienta, con el
 * MISMO nombre que en los otros chats (`registrar_cambio_acordado`) y su lista cerrada de operaciones. PURO.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { CAMPOS_DE_PROYECTO, CAMPOS_DE_TAREA, CUANDOS, ESTADOS_DE_PROYECTO_DEL_CHAT, LARGO_DEL_TITULO_DEL_CHAT, MAX_OPERACIONES_DEL_CHAT, MAX_TAREAS_DE_UN_PLAN, OPERACIONES_DE_TAREAS } from "./operaciones";

export const NOMBRE_DE_LA_HERRAMIENTA = "registrar_cambio_acordado";

export const PROMPT_DE_TAREAS = `Eres el asistente de TAREAS INTERNAS de Smarteam, dentro de Nexus. Conversas con UNA persona del equipo sobre su trabajo: sus tareas, las de su equipo, los proyectos de tareas y lo que le pide a otras personas. No es el cronograma que ve el cliente: eso no lo tocas nunca.

Cómo trabajas:
- Conversas hasta que el pedido está claro y entonces registras el cambio con la herramienta \`${NOMBRE_DE_LA_HERRAMIENTA}\`, UNA sola vez por turno. NO aplicas nada: la persona lee cada cambio traducido y lo aplica con un botón. Nada se crea solo.
- Si te falta un dato que de verdad importa (para quién, o un cliente que no está en la lista), pregunta y registra lo que ya está claro con "preguntaAbierta": true.
- Una pregunta sin cambios («¿qué tengo sin agendar?», «¿qué tiene Lidia esta semana?») se contesta con el contexto, sin llamar a la herramienta.
- Responde en español, corto, con tuteo (nunca voseo). Sin listas largas: la persona va a leer las líneas que arma Nexus.

Reglas de lo que registras:
- Lo tuyo lo decides tú. Lo que es para otra persona es una SUGERENCIA que decide ella (modo "proponer"). Solo si eres su líder, o los dos están en el mismo espacio libre, y la persona dijo «asígnale», usa modo "asignar". Si no se puede, Nexus lo pasa a propuesta y lo dice.
- «Anótame…» es para la persona ("para": "yo"). «Pídele a Marketing…» es para un equipo ("para": "equipo:<clave>"), y le llega a su líder.
- NUNCA inventes una fecha. Usa "cuando" de la lista (${CUANDOS.join(" · ")}). Una fecha exacta AAAA-MM-DD solo si la persona la escribió en este mensaje.
- Un PLAN («arma un plan de onboarding de 30 días») es un "proyecto.crear" con "inicia" y entre 5 y 15 "tarea.crear" con "proyecto" = su ref y "dia" (día hábil desde el inicio; 30 días son unos 22 días hábiles). "despuesDe" solo donde hay una dependencia real. Como mucho ${MAX_TAREAS_DE_UN_PLAN} tareas por plan. Las fechas las calcula Nexus.
- Títulos de ${LARGO_DEL_TITULO_DEL_CHAT} caracteres como mucho, que empiecen con un verbo en infinitivo («Revisar los copies del Radisson»), en tuteo.
- Cada "tarea.crear" lleva su "contexto": de una a tres frases que dicen para qué es, para quién y qué se espera, con lo que se dijo en esta conversación. Sin repetir el título, sin fechas ni montos que nadie dijo, en tuteo. Es lo que lee quien la recibe para entenderla. Las "notas" son otra cosa: solo si la persona dicta notas suyas.
- Las etiquetas del contexto (M#, C#, H#, R#, E#) valen SOLO en este turno: usa exactamente las que ves. Las tareas se nombran T-12. Una tarea o un proyecto nuevo lleva una "ref" corta («onb1») para que otras operaciones lo nombren.
- Un cliente que no está en la lista no lo inventes: pregunta.
- Si algo se parece a una tarea abierta de la lista, dilo en tu mensaje.
- No marcas tareas como hechas, no revisas la semana, no decides propuestas de otra persona, no agendas ni archivas: di dónde se hace («Agéndalas con “Agendar”», «Márcala en tu semana»).
- Lo PENDIENTE (lo que ya acordaron y no se aplicó) te llega en el mensaje, numerado P1, P2…: no lo repitas. Si algo ya no va, ponlo en "descartar".
- Como mucho ${MAX_OPERACIONES_DEL_CHAT} cambios por acuerdo.`;

const PARA = 'yo · una M# · "equipo:<clave>" · "nadie" (solo dentro de un proyecto)';

export const TOOL_ACUERDO_DE_TAREAS: Anthropic.Messages.Tool = {
  name: NOMBRE_DE_LA_HERRAMIENTA,
  description:
    "Registra lo acordado como OPERACIONES sobre las tareas de la persona. NO lo aplica: la persona las lee traducidas " +
    "y las aplica con un botón. Llámala UNA sola vez por turno.",
  input_schema: {
    type: "object",
    properties: {
      resumen: { type: "string", description: "Qué se acordó, en una o dos frases, para confirmarlo de un vistazo." },
      preguntaAbierta: {
        type: "boolean",
        description: "true si tu mensaje termina con una pregunta todavía sin contestar: no se ofrece aplicar hasta resolverla.",
      },
      descartar: { type: "array", items: { type: "string" }, description: "SOLO si lo PENDIENTE trae algo que ya no va: sus etiquetas (P1, P2…)." },
      operaciones: {
        type: "array",
        description: "Las operaciones, en orden. Vocabulario CERRADO.",
        items: {
          type: "object",
          properties: {
            op: { type: "string", enum: [...OPERACIONES_DE_TAREAS] },
            ref: { type: "string", description: "Para una tarea o un proyecto NUEVO: un nombre corto («onb1») para nombrarlo en otras operaciones." },
            titulo: { type: "string", description: `tarea.crear: el título (≤ ${LARGO_DEL_TITULO_DEL_CHAT} caracteres, en infinitivo).` },
            nombre: { type: "string", description: "proyecto.crear: el nombre del proyecto." },
            para: { type: "string", description: `tarea.crear y tarea.asignar: ${PARA}.` },
            modo: { type: "string", enum: ["proponer", "asignar"], description: "proponer (por defecto) o asignar (solo si la persona puede y lo pidió)." },
            cuando: { type: "string", description: `${CUANDOS.join(" · ")} o una fecha AAAA-MM-DD que la persona haya escrito.` },
            dia: { type: "integer", description: "Dentro de un plan: el día hábil desde el inicio del proyecto (1, 2, 3…)." },
            inicia: { type: "string", description: "proyecto.crear: cuándo empieza (un «cuando»)." },
            vence: { type: "string", description: "proyecto.crear: cuándo termina (un «cuando»)." },
            minutos: { type: "integer", description: "Cuánto toma, en minutos." },
            prioridad: { type: "string", enum: ["alta", "media", "baja"] },
            cliente: { type: "string", description: "Una C# de la lista." },
            proyectoHubspot: { type: "string", description: "Una H# de la lista (impone su cliente)." },
            proyecto: { type: "string", description: "Una R# de la lista o la ref de un proyecto nuevo de este acuerdo." },
            espacio: { type: "string", description: "proyecto.crear: una E# (por defecto, el de tu equipo)." },
            responsable: { type: "string", description: "proyecto.crear: una M#." },
            secciones: { type: "array", items: { type: "string" }, description: "proyecto.crear: las columnas del tablero." },
            seccion: { type: "string" },
            despuesDe: { type: "array", items: { type: "string" }, description: "T-# o refs de tareas nuevas a las que espera." },
            etiquetas: { type: "array", items: { type: "string" } },
            contexto: {
              type: "string",
              description: "tarea.crear (SIEMPRE): de una a tres frases que dicen para qué es, para quién y qué se espera, con lo que se dijo. Sin repetir el título.",
            },
            notas: { type: "string", description: "Solo si la persona dicta notas suyas para la tarea." },
            privada: { type: "boolean", description: "«Solo para mí»: solo en lo tuyo." },
            tarea: { type: "string", description: "tarea.editar · asignar · mover-semana · depender: una T-# o la ref de una tarea nueva." },
            campo: {
              type: "string",
              description: `tarea.editar: ${CAMPOS_DE_TAREA.join(", ")} (nunca el estado). proyecto.editar: ${CAMPOS_DE_PROYECTO.join(", ")} (estado: ${ESTADOS_DE_PROYECTO_DEL_CHAT.join(", ")}).`,
            },
            valor: { type: ["string", "number", "array", "null"], items: { type: "string" }, description: "El valor nuevo del campo (texto, número, lista, o null para quitarlo)." },
          },
          required: ["op"],
        },
      },
    },
    required: ["resumen"],
  } as Anthropic.Messages.Tool.InputSchema,
};
