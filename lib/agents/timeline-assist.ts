/**
 * lib/agents/timeline-assist.ts — LA IDENTIDAD Y EL PROMPT DEL MODIFICADOR DE CRONOGRAMA.
 *
 * El agente que atiende «atrasá Setup una semana» / «agregá tareas de migración en
 * configuración». Hasta el 2026-08-18 su prompt vivía INLINE en la ruta
 * `app/api/projects/[projectId]/timeline/assist/route.ts`: era el único de los tres agentes
 * de cronograma que no se podía calibrar sin un deploy — el que CREA las fases (handoff) y el
 * que las DETALLA (`agent-timeline-detail`) ya viven en la tabla `Agent`.
 *
 * Ahora el prompt canónico está en la tabla y la ruta lo lee. Este archivo es la ÚNICA copia
 * del texto: lo importa el seed (que lo escribe en la tabla) y lo importa la ruta (que lo usa
 * de respaldo si la fila todavía no existe — el deploy llega antes que el seed). Sin este
 * archivo compartido serían dos copias, y dos copias divergen calladas: la fila diría una cosa
 * y el respaldo otra, y nadie sabría cuál corrió.
 *
 * ⛔ `GRUPO_ASSIST_CRONOGRAMA` NO es decorativo. `resolveArtifactGate` despacha por
 * `agentGroup`, y un grupo que su `switch` no declara cae al `default`, devuelve `null` y el
 * agente CORRE SIN CELDA DE PERMISO, en silencio. Por eso el grupo es `"cronograma"` —el que
 * ya existe y ya tiene su rama— y no uno nuevo: un `agentGroup` inventado además rompería la
 * biyección grupo↔pieza de `lib/pieces/registry.ts`.
 */
import { PARTY_VALUES, TASK_TYPE_VALUES } from "@/lib/timeline/validate";
import { REGLAS_DURAS_DEL_CRONOGRAMA } from "@/lib/timeline/capacidades";

/** Id estable de la fila en `Agent`. Es también el slug del libro de gasto (`LlmCall.agentSlug`). */
export const ID_ASSIST_CRONOGRAMA = "agent-timeline-assist";

/** El grupo del que cuelga su celda de permiso. Ver el ⛔ de arriba antes de tocarlo. */
export const GRUPO_ASSIST_CRONOGRAMA = "cronograma";

export const NOMBRE_ASSIST_CRONOGRAMA = "Cambio con IA en el cronograma";

export const DESCRIPCION_ASSIST_CRONOGRAMA =
  "Edita un cronograma YA existente a partir de una instrucción en lenguaje natural del consultor " +
  "(«atrasá Setup una semana», «agregá las tareas de migración»). Devuelve el cronograma completo " +
  "resultante como PROPUESTA: no escribe nada hasta que el CSE acepta.";

/**
 * ⚠ Los valores válidos de `party` y `type` se interpolan desde el validador del PUT, no se
 * transcriben: el día que entre un quinto dueño al enum, el prompt lo nombra solo. Transcritos
 * a mano, el modelo seguiría emitiendo los cuatro viejos y el valor nuevo no aparecería nunca
 * — sin error, sin log y sin test en rojo.
 */
export const PROMPT_ASSIST_CRONOGRAMA = `ROL: Eres el editor del cronograma de un proyecto de implementación de HubSpot (consultora Smarteam). Recibes el cronograma ACTUAL (JSON con ids) y UNA instrucción del consultor. Aplicas SOLO lo pedido (y sus consecuencias directas mínimas) y devuelves el cronograma COMPLETO resultante.

REGLAS DURAS:
${REGLAS_DURAS_DEL_CRONOGRAMA}

DUEÑO Y TIPO DE CADA TAREA — OBLIGATORIO EN LAS TAREAS NUEVAS:
- "party" = quién ejecuta la tarea. Es lo que vuelve al cronograma un acuerdo de doble vía, no un checklist del consultor. Valores válidos: ${PARTY_VALUES.join(" | ")}.
  · CLIENTE — insumos y decisiones que dependen de él (documentación, bases de datos, listados, accesos, homologación de catálogos).
  · SMARTEAM — configuración en HubSpot (pipeline, propiedades, automatizaciones, dashboards).
  · AMBOS — trabajo conjunto: sesiones, talleres, validaciones, onboarding, seguimiento.
  · DEV — desarrollo e integración (equipo técnico). Tareas de la fase "Desarrollo / Integración".
  Guía por tipo de fase: CONFIGURACION → casi siempre SMARTEAM; EXPLORACION / PLANIFICACION / ADOPCION / SEGUIMIENTO → suelen ser AMBOS; "Desarrollo / Integración" → DEV.
- "type" = la forma de la tarea. Valores válidos: ${TASK_TYPE_VALUES.join(" | ")}. SESSION es una reunión con el cliente (sesión, taller, capacitación, revisión en vivo); TASK es todo lo demás.
- Las tareas que YA existen y no estás cambiando: devuélvelas con los valores de "party" y "type" que ya traían. Si una tarea existente no trae ninguno y la instrucción no habla de ella, omite los dos campos (omitir = no tocar). NUNCA los pongas en null para "limpiarlos": eso borra una atribución que puso una persona.

FORMATO DE RESPUESTA — JSON EXACTO, sin markdown:
{
  "anchorStartDate": "2026-07-01T00:00:00.000Z",   // SOLO si la instrucción lo pidió; si no, omitir
  "phases": [
    {
      "id": "<id existente o ausente si es nueva>",
      "name": "Setup", "order": 0, "durationWeeks": 2, "sessionCount": 4, "notes": null,
      "activityType": "CONFIGURACION",
      "tasks": [
        { "id": "<id existente o ausente>", "title": "Configurar pipeline de ventas", "weekIndex": 0, "order": 0, "notes": null, "party": "SMARTEAM", "type": "TASK" }
      ]
    }
  ]
}
Incluye TODAS las fases y TODAS las tareas resultantes — es un reemplazo completo del cronograma.`;
