/**
 * lib/asistente/contexto.ts — LO POCO QUE EL ASISTENTE NECESITA SABER.
 *
 * ── LA DECISIÓN DE DISEÑO, Y ES LA MÁS IMPORTANTE DEL CHAT ───────────────────────────────────
 * ⭐ **El chat entiende la INTENCIÓN; el editor tiene el CONTEXTO.**
 *
 * La tentación —y lo que un chat "bien hecho" parecería pedir— es cargarle todo: el handoff, las
 * minutas, el cronograma entero con sus 101 tareas. No hace falta y sale caro en las dos monedas:
 *
 *  · **Plata.** El prefijo se re-arma en CADA turno. Veinte turnos por conversación × quince
 *    conversaciones por día: cada mil tokens de más son ~$0,90/día que salen del mismo tope que
 *    comparten handoff, kickoff, cronograma y briefs.
 *  · **Calidad.** El chat no redacta el cronograma: decide qué INSTRUCCIÓN emitir. El contexto
 *    pesado ya lo tiene el modificador (`lib/contexto/asistente-cronograma.ts`), que es quien lo
 *    va a ejecutar. Dárselo dos veces no lo hace más listo — lo hace más lento y más caro.
 *
 * Así que acá va lo mínimo para sostener una conversación útil: de qué proyecto hablamos, QUÉ
 * FORMA tiene hoy el documento (nombres, no contenido) y QUÉ SE PUEDE PEDIR. La guarda de al lado
 * (`contexto.test.ts`) impide que este archivo importe los cargadores pesados.
 *
 * ⛔ Y NADA DE PARTNER NI DE COSTOS. El chat es una superficie nueva y no está en ningún censo de
 * privacidad: la prohibición se hace cumplir acá, con su propia guarda, antes de que exista un
 * campo donde meterlos.
 */
import { prisma } from "@/lib/db/prisma";
import {
  ADVERTENCIAS_DEL_CRONOGRAMA,
  REGLAS_DURAS_DEL_CRONOGRAMA,
} from "@/lib/timeline/capacidades";
import { projectedEnd } from "@/lib/timeline/weeks";
import { canvasOf } from "@/lib/pieces/canvas-query";

/**
 * ⚠ EL TECHO, Y ES UNA DECISIÓN, NO UNA CONSTANTE SUELTA. Si el prefijo crece más que esto, algo
 * pesado se coló — el modo de falla es mudo (nadie ve un prompt largo; se ve la factura tres
 * semanas después). La guarda lo hace cumplir sobre contexto armado de verdad.
 */
export const TECHO_DEL_PREFIJO_CHARS = 6_000;

export interface ContextoDelAsistente {
  /** El texto que va como prefijo cacheado del turno. */
  texto: string;
  /** Para el aviso de fechas: qué cierre proyecta HOY el cronograma. null si no hay ancla. */
  cierreActual: string | null;
}

/**
 * El contexto del chat sobre el CRONOGRAMA.
 *
 * ⚠ Trae los NOMBRES de las fases y cuántas tareas tiene cada una — nunca los títulos de las
 * tareas. Con los nombres alcanza para conversar ("alargá Setup una semana"); los títulos son
 * ~8.000 caracteres que el modificador ya lee cuando le toca ejecutar.
 */
export async function contextoDeCronograma(projectId: string): Promise<ContextoDelAsistente> {
  const timeline = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: {
      anchorStartDate: true,
      closeDateOverride: true,
      project: { select: { name: true, client: { select: { name: true } } } },
      phases: {
        orderBy: { order: "asc" },
        select: {
          /* ⭐ EL ID VIAJA, y es lo que deja que el asistente emita OPERACIONES en vez de una
             instrucción de texto. Son ~25 caracteres por fase (~275 en el cronograma más grande
             de la cartera) y compran que el destinatario de un cambio sea inequívoco: Wherex
             tiene fases con nombres casi iguales («Marketing Hub» y «Configuración Marketing
             Hub»), así que resolver por nombre sería adivinar. */
          id: true,
          name: true,
          durationWeeks: true,
          startWeek: true,
          activityType: true,
          /* ⚠ SOLO CONTADORES: `weekIndex` y `status`, jamás el título ni la nota. Es la línea
             entre la FORMA del cronograma y su CONTENIDO — dos enteros por tarea son ~250
             caracteres para todo Wherex; los títulos son ~8.000 que el modificador ya lee.
             Ver el porqué de este agregado en el bloque `REPARTO POR SEMANA`, abajo. */
          tasks: { select: { weekIndex: true, status: true } },
        },
      },
    },
  });
  if (!timeline) {
    return { texto: "Este proyecto todavía no tiene cronograma.", cierreActual: null };
  }

  const fin = projectedEnd(
    timeline.anchorStartDate ? timeline.anchorStartDate.toISOString() : null,
    timeline.phases,
  );
  const cierre = timeline.closeDateOverride
    ? fmtFecha(timeline.closeDateOverride)
    : fin.label;

  /**
   * ⭐ EL REPARTO POR SEMANA, Y POR QUÉ ES IMPRESCINDIBLE (2026-08-20).
   *
   * La primera versión daba solo el TOTAL de tareas por fase, y Elías pidió esto:
   * *«en la fase Integraciones hay semanas sin tareas, quítalas»*. El asistente tuvo que
   * contestar que no podía verlo — y era cierto: con «16 tareas» no hay forma de saber que las
   * semanas 3 a 6 están vacías.
   *
   * Eso NO contradice «el chat entiende la intención, el editor tiene el contexto»: era yo
   * quedándome corto de mi propia regla. La FORMA del cronograma incluye cómo se reparte el
   * trabajo; lo que se sigue excluyendo es el CONTENIDO (títulos y notas). El histograma son
   * ~250 caracteres para el cronograma más grande de la cartera; los títulos, ~8.000.
   *
   * Y de paso resuelve una familia entera de pedidos que hoy el chat no podía atender: «esta
   * fase está vacía», «acortá esto», «hay una semana con 12 tareas y otra con ninguna».
   */
  const repartoDe = (f: (typeof timeline.phases)[number]): string => {
    const porSemana = Array.from({ length: Math.max(f.durationWeeks, 1) }, () => 0);
    let hechas = 0;
    for (const t of f.tasks) {
      if (t.weekIndex >= 0 && t.weekIndex < porSemana.length) porSemana[t.weekIndex]++;
      if (t.status === "DONE") hechas++;
    }
    const vacias = porSemana.filter((n) => n === 0).length;
    return (
      `semanas [${porSemana.join(" · ")}]` +
      (vacias > 0 ? ` — ${vacias} ${vacias === 1 ? "semana VACÍA" : "semanas VACÍAS"}` : "") +
      (hechas > 0 ? ` · ${hechas} hecha${hechas === 1 ? "" : "s"}` : "")
    );
  };

  const fases = timeline.phases
    .map(
      (f, i) =>
        `${i + 1}. ${f.name} [${f.id}] — ${f.durationWeeks} sem` +
        `${f.activityType ? ` · ${f.activityType.toLowerCase()}` : ""}` +
        ` · ${f.tasks.length} tarea${f.tasks.length === 1 ? "" : "s"}` +
        `\n   ${repartoDe(f)}`,
    )
    .join("\n");

  const texto = [
    `PROYECTO: ${timeline.project.name} — cliente ${timeline.project.client.name}`,
    "",
    "FORMA DEL CRONOGRAMA HOY. Entre corchetes va el ID de la fase — úsalo para referirte a ella.",
    "`semanas [a · b · c]` = cuántas tareas caen en cada semana de esa",
    "fase, en orden. Los TÍTULOS de las tareas no están acá a propósito: los lee el modificador",
    "cuando le toque ejecutar la instrucción.",
    fases || "(sin fases)",
    "",
    `Arranque: ${timeline.anchorStartDate ? fmtFecha(timeline.anchorStartDate) : "SIN FECHA DE ARRANQUE"}`,
    `Cierre proyectado: ${cierre ?? "no se puede calcular sin fecha de arranque"}`,
    `Ancho de calendario: ${fin.spanWeeks} semanas`,
    "",
    "REGLAS DURAS DEL MODIFICADOR (lo que va a pasar cuando ejecute la instrucción):",
    REGLAS_DURAS_DEL_CRONOGRAMA,
    "",
    "CONSECUENCIAS QUE HAY QUE DECIR ANTES, no después de aplicar:",
    ADVERTENCIAS_DEL_CRONOGRAMA.map((a) => `- ${a.aviso}`).join("\n"),
  ].join("\n");

  return { texto, cierreActual: cierre };
}

/**
 * El contexto del chat sobre un DOCUMENTO (kickoff, desarrollo, entrega…).
 *
 * ⚠ Trae las secciones con su rótulo y si tienen contenido — nunca el contenido. Un kickoff
 * generado son ~20.000 caracteres, y el chat no los necesita para entender «reescribí el alcance
 * en dos párrafos»: los necesita el assist del documento, que ya los carga.
 */
export async function contextoDeDocumento(
  projectId: string,
  pieza: string,
): Promise<ContextoDelAsistente> {
  const canvas = await prisma.projectCanvas.findFirst({
    where: { projectId, ...canvasOf(pieza) },
    select: {
      name: true,
      project: { select: { name: true, client: { select: { name: true } } } },
      /* ⚠ `canvasSections` es la RELACIÓN; `sections` es un Json con los briefs por sección
         (lib/business-cases/section-briefs.ts). Pedir el Json acá devuelve otra cosa, y el
         error no es de tipos si alguien lo castea: es un contexto que miente. */
      canvasSections: {
        orderBy: { order: "asc" },
        select: { key: true, label: true, _count: { select: { blocks: true } } },
      },
    },
  });
  if (!canvas) {
    return { texto: "Este proyecto todavía no tiene ese documento.", cierreActual: null };
  }

  const secciones = canvas.canvasSections
    .map(
      (s: { key: string; label: string; _count: { blocks: number } }) =>
        `- ${s.label} (${s.key}) — ${s._count.blocks > 0 ? "con contenido" : "VACÍA"}`,
    )
    .join("\n");

  /* `project` es nullable en el schema porque un ProjectCanvas puede colgar de un BusinessCase.
     Acá filtramos por projectId, así que en la práctica está — pero se maneja igual: un `!` acá
     sería una promesa sobre una consulta que alguien puede cambiar después. */
  const identidad = canvas.project
    ? `PROYECTO: ${canvas.project.name} — cliente ${canvas.project.client.name}`
    : "PROYECTO: (sin identificar)";

  const texto = [
    identidad,
    `DOCUMENTO: ${canvas.name}`,
    "",
    "SECCIONES (rótulos y estado; el contenido NO está acá a propósito — el editor del documento",
    "lo lee cuando le toque ejecutar la instrucción):",
    secciones || "(sin secciones)",
    "",
    "QUÉ SE PUEDE PEDIR: reescribir el contenido de una sección que ya existe, con la instrucción",
    "que le des. ⛔ El asistente NO puede inventar tipos de sección que nadie programó: si te",
    "piden algo que no existe como forma, decilo en vez de intentarlo.",
  ].join("\n");

  return { texto, cierreActual: null };
}

function fmtFecha(d: Date): string {
  return d.toISOString().slice(0, 10);
}
