/**
 * lib/contexto/asistente-cronograma.ts — LAS FUENTES DEL MODIFICADOR. Puro, sin Prisma.
 *
 * ── EL HUÉRFANO DE LOS TRES AGENTES DE CRONOGRAMA (Tramo 1, 2026-08-18) ──────
 * El cronograma lo tocan tres agentes: el que lo CREA (handoff), el que lo DETALLA
 * (`agent-timeline-detail`) y el que lo MODIFICA a pedido del CSE («atrasá Setup una semana»).
 * Los dos primeros ven el negocio: el handoff curado, el requerimiento técnico, las
 * instrucciones del CSE. El tercero veía **solamente el cronograma crudo** — fases, tareas y
 * nada más.
 *
 * Por eso el CSE le pedía cosas que el modificador no podía hacer bien: agregar tareas de
 * migración sin saber qué se vendió, reordenar fases sin saber qué depende de qué. La queja
 * textual de Elías fue *«puede que el modificador no sea capaz de generar ese tipo; pero el
 * usuario no obtiene esa respuesta»*. La mitad de eso es falta de contexto, y es esto.
 *
 * ── ⚠ LA DIFERENCIA CON EL CREADOR, Y NO ES UN DETALLE ───────────────────────
 * El detalle (`detalle-cronograma.ts`) mira un cronograma SIN estados: está poblándolo por
 * primera vez. El modificador edita uno VIVO, con tareas hechas, en curso y suspendidas — y
 * omitir una es borrarla. Por eso acá el cronograma llega **con `status` y `source`**, y el
 * prompt se lo explica. Es la misma razón por la que el servidor rescata el progreso al
 * aplicar (`lib/timeline/rescate-progreso.ts`): la doble red es a propósito.
 *
 * ⛔ Y por eso este archivo NO reusa `fuentesDelDetalle`: comparten tres de cuatro fuentes,
 * pero la que difiere es justo la que decide si se pierde trabajo humano. Fusionarlas
 * invitaría a que un cambio en el creador le saque el `status` al modificador sin que nadie
 * lo note.
 */
import type { FuenteDeContexto } from "./tipos";

/** Lo que se le dice al modelo cuando el CSE todavía no confirmó nada del handoff. */
export const SIN_HANDOFF_CONFIRMADO_ASSIST =
  "(el CSE todavía no confirmó bloques del handoff — no inventes alcance que no esté en el cronograma)";

export interface CrudasDelAssist {
  /** El cronograma vivo, serializado CON ids y CON el estado de cada tarea. */
  cronogramaCtx: string;
  /** Handoff, SOLO bloques confirmados por el CSE. */
  handoffCtx: string;
  /** Canvas Desarrollo, "" si el proyecto no tiene. */
  desarrolloCtx: string;
  /** Bloque de operativa de HubSpot (estado, prioridad, motivo de bloqueo). "" si no aplica. */
  operativaCtx: string;
}

export function fuentesDelAssist(crudas: CrudasDelAssist): FuenteDeContexto[] {
  return [
    {
      key: "cronograma-vivo",
      ambito: "proyecto",
      texto:
        "=== CRONOGRAMA ACTUAL (el que vas a editar — con ids y con el estado de cada tarea) ===\n" +
        crudas.cronogramaCtx,
    },
    {
      key: "handoff-curado",
      ambito: "proyecto",
      texto: `=== QUÉ SE VENDIÓ (handoff, bloques confirmados por el CSE) ===\n${crudas.handoffCtx || SIN_HANDOFF_CONFIRMADO_ASSIST}`,
    },
    {
      key: "requerimiento-tecnico",
      ambito: "proyecto",
      texto: crudas.desarrolloCtx
        ? `=== REQUERIMIENTO TÉCNICO (canvas Desarrollo — objetos, llaves y conexiones) ===\n${crudas.desarrolloCtx}`
        : "",
    },
    {
      key: "operativa-hubspot",
      ambito: "proyecto",
      texto: crudas.operativaCtx
        ? `=== CÓMO VA EL PROYECTO HOY (según HubSpot) ===\n${crudas.operativaCtx}`
        : "",
    },
  ];
}

/**
 * ⛔ LA REGLA QUE HACE QUE ESTE CONTEXTO NO SEA PELIGROSO.
 *
 * Todo lo de arriba es material INTERNO. El texto del cronograma —títulos de tareas, nombres
 * de fase, notas— es DE CARA AL CLIENTE: se publica en el enlace externo y se imprime en el
 * PDF que el CSE le manda. Sumarle contexto de negocio al modificador sube exactamente ese
 * riesgo: que el modelo copie al Gantt una frase que salió de un documento interno.
 *
 * Esta regla va al prompt SIEMPRE, y su guarda (`asistente-cronograma.test.ts`) mete un
 * centinela en el contexto y verifica que no aparezca en la salida. ⚠ El break honesto de esa
 * guarda es sacar ESTA constante del prompt y confirmar que el centinela sí aparece — si
 * aparece igual con y sin la regla, la regla no está ganada y la guarda es decorativa.
 */
export const REGLA_DE_FRONTERA_DEL_ASSIST = `⛔ FRONTERA — el contexto de arriba es INTERNO; el cronograma que devuelves lo LEE EL CLIENTE.
- Usá el handoff, el requerimiento técnico y la operativa para DECIDIR qué cambiar (qué tareas hacen falta, en qué orden, cuánto duran). NUNCA los copies al texto.
- Ningún título ni nota puede contener: nombres de personas del equipo de Smarteam, montos, condiciones comerciales, riesgos internos, ni frases textuales de esos documentos.
- Si una fuente interna te da la razón para agregar una tarea, escribí la TAREA, no la razón.`;
