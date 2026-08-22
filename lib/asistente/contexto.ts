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
import {
  ADVERTENCIAS_DEL_DOCUMENTO,
  REGLAS_DURAS_DEL_DOCUMENTO,
  catalogoParaElChat,
  operacionesParaElChat,
} from "@/lib/canvas/capacidades-de-documento";
import type { SeccionActual } from "@/lib/canvas/operaciones-de-documento";
import { DOC } from "@/lib/canvas/assist-de-documento";
import { EXPLORACION_DEF_BY_KEY } from "@/components/landing/configs/exploracion.defs";
import { esCustomKey } from "@/lib/landing/custom-sections";
import { prisma } from "@/lib/db/prisma";
import {
  ADVERTENCIAS_DEL_CRONOGRAMA,
  REGLAS_DURAS_DEL_CRONOGRAMA,
} from "@/lib/timeline/capacidades";
import { projectedEnd } from "@/lib/timeline/weeks";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { handleDeTarea } from "@/lib/timeline/handle-de-tarea";

/**
 * ⚠ EL TECHO, Y ES UNA DECISIÓN, NO UNA CONSTANTE SUELTA. Si el prefijo crece más que esto, algo
 * pesado se coló — el modo de falla es mudo (nadie ve un prompt largo; se ve la factura tres
 * semanas después). La guarda lo hace cumplir sobre contexto armado de verdad.
 *
 * ── POR QUÉ SUBIÓ DE 6.000 A 13.000 EL 2026-08-21 ────────────────────────────────────────────
 * Porque entraron las TAREAS, y sin ellas el chat no podía hacer casi nada: tenía tres
 * operaciones de tarea en el vocabulario y ni un id para nombrarlas. Medido sobre los 51
 * cronogramas reales, con el handle de 5 caracteres en vez del cuid entero, el más grande
 * (Wherex, 98 tareas) queda en ~11.000 y **ninguno se pasa de 13.000**.
 *
 * ⛔ Esto NO reabre «cargar el handoff entero en el chat». Lo que entró es la lista de tareas del
 * cronograma del que se está hablando —la FORMA del documento— no el material de negocio. Un
 * kickoff generado son ~20.000 caracteres él solo, y sigue afuera.
 *
 * El costo real es despreciable: ~3.000 tokens que se cachean desde el segundo turno.
 */
/** Los estados como los nombra la pantalla. Se omite «pendiente»: es el caso mayoritario. */
function estadoCorto(status: string): string {
  if (status === "DONE") return "hecha";
  if (status === "IN_PROGRESS") return "en curso";
  if (status === "SUSPENDED") return "suspendida";
  return status.toLowerCase();
}

/**
 * ⭐ LO QUE EL MODELO NECESITA PARA NO PROMETER UN BORRADO QUE SE VA A RECHAZAR.
 *
 * El ejecutor rechaza `tarea.borrar` sobre lo que `isKept` protege: estado distinto de pendiente
 * **o** `source === "HUMAN"`. El estado ya se mostraba; la procedencia no — así que una tarea
 * pendiente cargada a mano se le veía idéntica a una pendiente escrita por la IA, y el chat
 * proponía borrarla para que el ejecutor la rechazara después. Peor todavía: las tareas que crea
 * el propio chat nacen `HUMAN`, o sea que el chat no podía deshacer lo que acababa de hacer, y no
 * tenía cómo saberlo antes de intentarlo.
 */
function marcaDe(t: { status: string; source: string | null }): string {
  if (t.status && t.status !== "PENDING") return estadoCorto(t.status);
  return t.source === "HUMAN" ? "cargada a mano" : "";
}

/**
 * Cuánto contenido de UNA sección entra al contexto del chat de documentos.
 *
 * ⚠ Es por sección y no un tope global a propósito: con un presupuesto global, las secciones del
 * final de un documento largo quedarían INVISIBLES para el modelo, y eso no se nota — contestaría
 * sobre un documento que cree completo. Recortando cada una, todas están, y la que se recortó lo
 * dice.
 */
export const TOPE_POR_SECCION_CHARS = 1_000;

/**
 * Lo que se puede leer de un bloque. Los bloques son Json con formas distintas por tipo de
 * sección (texto, listas, tarjetas), así que se recorre y se junta lo que sea string.
 *
 * ⛔ Solo strings: un volcado del Json crudo metería ids, flags y claves internas al prompt —
 * ruido que el modelo puede citarle al CSE como si fuera contenido del documento.
 */
function textoDeBloque(data: unknown, profundidad = 0): string {
  if (profundidad > 4) return "";
  if (typeof data === "string") return data.trim();
  if (typeof data === "number") return String(data);
  if (Array.isArray(data)) {
    return data
      .map((x) => textoDeBloque(x, profundidad + 1))
      .filter(Boolean)
      .join(" · ");
  }
  if (data && typeof data === "object") {
    return Object.values(data as Record<string, unknown>)
      .map((x) => textoDeBloque(x, profundidad + 1))
      .filter(Boolean)
      .join(" · ");
  }
  return "";
}

export const TECHO_DEL_PREFIJO_CHARS = 13_000;

export interface ContextoDelAsistente {
  /** El texto que va como prefijo cacheado del turno. */
  texto: string;
  /** Para el aviso de fechas: qué cierre proyecta HOY el cronograma. null si no hay ancla. */
  cierreActual: string | null;
  /**
   * Las fases tal como estaban al armar el contexto — SOLO para traducir las operaciones
   * acordadas a castellano (`describirOperaciones`).
   *
   * ⚠ NO es contexto del modelo: no entra al prefijo. Se devuelve acá porque la consulta que lo
   * arma ya las trajo, y pedirlas de nuevo sería una segunda lectura de lo mismo.
   */
  fases?: {
    id: string;
    name: string;
    durationWeeks: number;
    tareas: number;
    /* ⚠ Las tareas de verdad, con id y título. Antes acá viajaba solo el CONTEO, y `turno.ts`
       fabricaba tareas vacías (`{id:"", title:"", weekIndex:0}`) para traducir el acuerdo: la
       cajita azul imprimía el id crudo en cualquier operación de tarea. */
    /* ⚠ `source` viaja aunque no se RENDERICE en el texto del contexto: lo usa `turno.ts` para
       traducir el acuerdo, donde `isKept` decide si una tarea tiene trabajo humano encima. */
    items: { id: string; title: string; weekIndex: number; status: string; source: string | null }[];
  }[];
  /** El arranque del proyecto, para el mismo uso. */
  ancla?: string | null;
  /**
   * Las secciones del DOCUMENTO tal como estaban al armar el contexto — mismo papel que `fases`
   * del otro lado: traducir las operaciones acordadas a castellano y ejecutarlas.
   *
   * ⚠ NO entra al prefijo. Se devuelve acá porque la consulta que arma el texto ya las trajo.
   */
  secciones?: SeccionActual[];
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
          /* ⚠ CON TÍTULO E ID desde el 2026-08-21. La primera versión mandaba solo contadores
             y era la línea entre la FORMA y el CONTENIDO — pero se llevaba puesto el caso de
             uso principal: el CSE pide «pasá la sesión de cierre al final» o «borrá la última
             base» y el chat no tenía con qué nombrarlas. Las NOTAS siguen afuera (son el
             contenido de verdad, y las lee el modificador). Ver el techo, arriba. */
          tasks: {
            orderBy: [{ weekIndex: "asc" }, { order: "asc" }],
            select: { id: true, title: true, weekIndex: true, status: true, source: true },
          },
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
    /* ⚠ El histograma en sí se retiró: abajo va la lista de tareas POR SEMANA, que dice lo mismo
       y además las nombra. Lo que queda es el resumen — es lo que el modelo lee de un vistazo
       para contestar «esta fase está medio vacía» sin recorrer veinte renglones. */
    return (
      (vacias > 0 ? ` — ${vacias} ${vacias === 1 ? "semana VACÍA" : "semanas VACÍAS"}` : "") +
      (hechas > 0 ? ` · ${hechas} hecha${hechas === 1 ? "" : "s"}` : "")
    );
  };

  /**
   * ⭐ LAS TAREAS, AGRUPADAS POR SEMANA (2026-08-21).
   *
   * Agrupar no es cosmética: es lo que deja que el histograma se retire sin perder nada. Una
   * semana sin tareas se ve porque su renglón dice «(vacía)», así que el CSE que pide «quitá las
   * semanas sin tareas» —314 semanas así en la cartera— sigue teniendo respuesta.
   *
   * El estado va en una palabra y SOLO cuando no es pendiente: repetir «pendiente» sesenta veces
   * es pagar caracteres por nada.
   */
  const tareasDe = (f: (typeof timeline.phases)[number]): string => {
    const semanas = Math.max(f.durationWeeks, 1);
    const renglones: string[] = [];
    for (let w = 0; w < semanas; w++) {
      const suyas = f.tasks.filter((t) => t.weekIndex === w);
      if (suyas.length === 0) {
        renglones.push(`   S${w + 1}: (vacía)`);
        continue;
      }
      renglones.push(
        `   S${w + 1}: ` +
          suyas
            .map(
              (t) =>
                `${t.title} [${handleDeTarea(t.id)}]` +
                (marcaDe(t) ? ` (${marcaDe(t)})` : ""),
            )
            .join(" · "),
      );
    }
    /* Las que quedaron fuera de rango existen de verdad —se midieron 30 en producción antes de
       sanearlas— y hay que poder nombrarlas para arreglarlas, no esconderlas. */
    const fuera = f.tasks.filter((t) => t.weekIndex < 0 || t.weekIndex >= semanas);
    if (fuera.length > 0) {
      renglones.push(
        `   ⚠ fuera de rango: ` +
          fuera.map((t) => `${t.title} [${handleDeTarea(t.id)}] (S${t.weekIndex + 1})`).join(" · "),
      );
    }
    return renglones.join("\n");
  };

  const fases = timeline.phases
    .map(
      (f, i) =>
        `${i + 1}. ${f.name} [${f.id}] — ${f.durationWeeks} sem` +
        `${f.activityType ? ` · ${f.activityType.toLowerCase()}` : ""}` +
        ` · ${f.tasks.length} tarea${f.tasks.length === 1 ? "" : "s"}` +
        `${repartoDe(f)}` +
        `\n${tareasDe(f)}`,
    )
    .join("\n");

  const texto = [
    `PROYECTO: ${timeline.project.name} — cliente ${timeline.project.client.name}`,
    "",
    "EL CRONOGRAMA HOY. Cada fase trae su ID entre corchetes y, debajo, sus tareas agrupadas por",
    "semana (S1, S2…). Cada tarea trae su identificador entre corchetes: es lo que va en `taskId`",
    "para moverla o borrarla. Una tarea sin nada entre paréntesis está pendiente y la escribió la",
    "IA. ⛔ Las que dicen «hecha», «en curso», «suspendida» o «cargada a mano» NO se pueden borrar",
    "desde el chat: el cronograma las protege. Dilo antes de proponerlo.",
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

  return {
    texto,
    cierreActual: cierre,
    fases: timeline.phases.map((f) => ({
      id: f.id,
      name: f.name,
      durationWeeks: f.durationWeeks,
      tareas: f.tasks.length,
      items: f.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        weekIndex: t.weekIndex,
        status: t.status,
        source: t.source,
      })),
    })),
    ancla: timeline.anchorStartDate ? fmtFecha(timeline.anchorStartDate) : null,
  };
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
        select: {
          id: true,
          key: true,
          label: true,
          _count: { select: { blocks: true } },
          blocks: { orderBy: { order: "asc" }, select: { data: true } },
        },
      },
    },
  });
  if (!canvas) {
    return { texto: "Este proyecto todavía no tiene ese documento.", cierreActual: null };
  }

  /**
   * ⭐ EL CONTENIDO ENTRA — y es la tercera vez que esta frontera se corre, siempre por el uso.
   *
   * Elías, 2026-08-21: *«en la sección Del hoy al nuevo sistema, agregá un bullet más a cada
   * lista»* → *«hazlo tú, sácalo de lo que ya está»*. El chat tuvo que contestar que no tiene el
   * contenido a la vista, y dejó una instrucción vaga: «completa cada lista con un punto adicional
   * coherente con el estilo». El editor iba a inventar sobre algo que nadie leyó.
   *
   * ⚠ El supuesto que lo mantenía afuera —«un kickoff son ~20.000 caracteres»— nunca se había
   * medido. Medido el 2026-08-21 sobre los 172 documentos reales:
   *
   *   kickoff             mediana    485 · p90    838 · max  7.671   (111 documentos)
   *   tech-requirements   mediana 16.082 · p90 20.006 · max 37.579   (52)
   *
   * O sea: el documento de la queja entra ENTERO en medio kilobyte. Lo pesado son los técnicos.
   *
   * Por eso el corte es POR SECCIÓN y no global: así TODAS quedan representadas —el modelo nunca
   * se encuentra con una sección invisible— y solo se recorta la que de verdad es larga. Con la
   * mediana por sección en 267 caracteres, en la mayoría no se recorta nada.
   */
  const renderDeContenido = (bloques: { data: unknown }[]): string => {
    const crudo = bloques
      .map((b) => textoDeBloque(b.data))
      .filter(Boolean)
      .join(" · ");
    if (!crudo) return "";
    return crudo.length > TOPE_POR_SECCION_CHARS
      ? `${crudo.slice(0, TOPE_POR_SECCION_CHARS)}… (recortado — el editor sí lo lee entero)`
      : crudo;
  };

  const secciones = canvas.canvasSections
    .map((s: { key: string; label: string; _count: { blocks: number }; blocks: { data: unknown }[] }) => {
      if (s._count.blocks === 0) return `- ${s.label} (${s.key}) — VACÍA`;
      const contenido = renderDeContenido(s.blocks);
      return contenido
        ? `- ${s.label} (${s.key}):\n    ${contenido}`
        : `- ${s.label} (${s.key}) — con contenido (no legible como texto)`;
    })
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
    "SECCIONES, con su contenido. Entre paréntesis va la KEY: nómbrala en la instrucción para que",
    "el editor sepa cuál tocar. Lo que diga «(recortado)» está incompleto acá — el editor sí lo lee",
    "entero al ejecutar, así que puedes pedir cambios sobre esa sección igual, pero no afirmes qué",
    "dice el final.",
    secciones || "(sin secciones)",
    "",
    /* ⛔ INTERPOLADAS, NO TRANSCRITAS. Hasta el 2026-08-22 acá había un párrafo escrito a mano que
       decía lo mismo que el prompt del chat — dos copias de la misma regla, y una de las dos ya
       estaba equivocada (afirmaba que no se pueden crear secciones nuevas, cuando la propuesta
       comercial las creaba desde el 2026-08-12). Ahora las dos salen del mismo archivo, y hay una
       guarda que impide volver a copiarlas. */
    "REGLAS DEL EDITOR (lo que va a pasar cuando se ejecute cada operación):",
    REGLAS_DURAS_DEL_DOCUMENTO,
    "",
    "OPERACIONES QUE EXISTEN — es una lista CERRADA:",
    operacionesParaElChat(),
    "",
    "TIPOS DE SECCIÓN QUE SE PUEDEN CREAR — también cerrada. Si te piden una forma que no está",
    "aquí, dilo en vez de usar la más parecida:",
    catalogoParaElChat(),
    "",
    "CONSECUENCIAS QUE HAY QUE DECIR ANTES, no después de aplicar:",
    ADVERTENCIAS_DEL_DOCUMENTO.map((a) => `- ${a.aviso}`).join("\n"),
  ].join("\n");

  /**
   * Las secciones para EJECUTAR y para TRADUCIR. No entran al prefijo: la consulta de arriba ya
   * las trajo, así que pedirlas de nuevo sería leer lo mismo dos veces.
   *
   * ⚠ `movible` sale de `pinned` de la def: la portada y el cierre tienen lugar fijo, y un
   * documento sin portada no es más libre — está roto.
   */
  /* ⚠ NO sale solo de `DOC`: ése es el registro del ASSIST, y Exploración conversa sin estar ahí
     (ver `lib/asistente/piezas.ts`). Sin este respaldo sus secciones llegarían sin esquema, y una
     operación sobre ellas se rechazaría con «no es un campo de esa sección» — sobre campos que sí
     existen. */
  const defs = DOC[pieza]?.defs ?? (pieza === "exploration" ? EXPLORACION_DEF_BY_KEY : {});
  const seccionesParaEjecutar: SeccionActual[] = canvas.canvasSections.map((s) => {
    const def = defs[s.key];
    const card = s.blocks[0];
    return {
      id: s.id,
      key: s.key,
      label: s.label,
      data: card?.data ?? {},
      schema: def?.schema ?? { type: "object", properties: {} },
      /* El ojo no entra al contexto del modelo —no cambia lo que se puede pedir— pero el
         ejecutor lo necesita para no proponer ocultar algo que ya está oculto. */
      oculta: false,
      esCreada: esCustomKey(s.key),
      movible: !def?.pinned,
    };
  });

  return { texto, cierreActual: null, secciones: seccionesParaEjecutar };
}

function fmtFecha(d: Date): string {
  return d.toISOString().slice(0, 10);
}
