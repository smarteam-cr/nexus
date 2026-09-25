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
 *
 * ── EXCEPCIÓN — decisión de Elías 2026-09-23 ─────────────────────────────────────────────────
 * En el CRONOGRAMA el ejecutor ya no es un modelo: es `aplicarOperaciones`, código puro que
 * escribe TAL CUAL las operaciones que el chat acordó. La premisa «el editor tiene el contexto»
 * no se cumple ahí: si el chat no ve las reuniones que el CSE eligió ni sus notas, nadie las ve
 * en ese camino. Por eso entran —las reuniones elegidas (con sus minutas), las notas y las
 * «Instrucciones adicionales» del cronograma— por UNA sola puerta (`materialDelCronograma`, abajo),
 * con un espacio propio, en su PROPIO bloque cacheado del `system` y SOLO en la pieza cronograma.
 * El handoff, los kickoffs y las reuniones que el CSE no eligió siguen afuera.
 */
import {
  ADVERTENCIAS_DEL_DOCUMENTO,
  AVISO_DE_CAPACIDAD_PARA_EL_CHAT,
  reglasDelDocumento,
  capacidadesDeLaPieza,
  capacidadDeSeccion,
  catalogoParaElChat,
  schemaParaElChat,
  nombreParaElChat,
  firmaDeSeccion,
  operacionesParaElChat,
  renderSeccionParaElChat,
  cuerpoDeSeccionParaElChat,
  FIRMA_DE_TEXTO_CORRIDO,
} from "@/lib/canvas/capacidades-de-documento";
import type { SeccionActual } from "@/lib/canvas/operaciones-de-documento";
import { DOC } from "@/lib/canvas/assist-de-documento";
import { EXPLORACION_DEF_BY_KEY } from "@/components/landing/configs/exploracion.defs";
import { defsForCanvas } from "@/components/landing/configs/templates.defs";
import { resolveCaseTypeFor } from "@/lib/business-cases/resolve-template";
import type { Dueno } from "./hilo";
import { PIEZA_ROL } from "@/lib/asistente/piezas";
import type { BCSectionDef } from "@/components/landing/configs/business-case.defs";
import { customDef } from "@/lib/landing/catalogo-de-secciones";
import { esCustomKey } from "@/lib/landing/custom-sections";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { sectionDefsForDocType } from "@/lib/roles/doc-type";
import {
  ADVERTENCIAS_DEL_CRONOGRAMA,
  REGLAS_DURAS_DEL_CRONOGRAMA,
} from "@/lib/timeline/capacidades";
import { projectedEnd } from "@/lib/timeline/weeks";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { datosDeSeccion, formatoDeSeccion, markdownDeBloques } from "@/lib/landing/formato-de-seccion";
import { handleDeTarea } from "@/lib/timeline/handle-de-tarea";
import type { EstadoDelVacio } from "@/lib/timeline/borrador";
import { leerEstadoDelVacio } from "@/lib/timeline/borrador-del-detalle";
/* ⭐ La ÚNICA puerta del chat al material del cronograma (ver la EXCEPCIÓN del header). Trae su
   propio presupuesto: los cargadores de los agentes siguen prohibidos acá (contexto.test.ts). */
import { cargarMaterialParaElChat } from "@/lib/contexto/cargar";
import {
  AVISO_DEL_MATERIAL_ILEGIBLE,
  LECTURA_CON_ERROR,
  type LecturaDelMaterial,
} from "@/lib/contexto/material-cronograma";

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
 *
 * ── MEDICIÓN DEL 2026-08-22, con la FIRMA de cada sección ya adentro ─────────────────────────
 * Sobre los 40 documentos más grandes de producción: mediana **6.022**, máximo **11.937** (un
 * kickoff de 13 secciones). Entra, pero el margen bajó a ~8 %.
 *
 * ⚠ Lo que entró es la forma —los nombres de las listas y los campos de cada sección— y no es
 * negociable: sin eso el modelo tiene que adivinar cómo se llama cada cosa para poder nombrarla,
 * que es exactamente lo que hacía fallar todos los cambios. Si el prefijo vuelve a crecer, lo que
 * se recorta primero es el CONTENIDO (bajar `TOPE_POR_SECCION_CHARS`), no la forma: el contenido
 * completo de la sección que importa ya se puede pedir aparte, por el chip.
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
/**
 * ⭐ 6.000 desde el 2026-08-23 — decisión de Elías: «no importa si gasta más tokens, pero que
 * funcione». Estaba en 1.000, y la medición del docblock de abajo dice que un kickoff entero
 * tiene mediana 485 y máximo 7.671: con 6.000 casi nada se recorta, y lo que se recortaba era
 * justo lo que hacía que el modelo no encontrara un ítem del final.
 * ⚠ El prefijo sigue cacheado —el breakpoint está al final del bloque de contexto—, así que
 * esto se paga UNA vez por hilo, no por turno.
 */
export const TOPE_POR_SECCION_CHARS = 6_000;

/**
 * ⛔ ACÁ VIVÍAN `textoDeBloque` Y `recortarContenido`, Y SE RETIRARON EL 2026-08-23.
 *
 * `textoDeBloque` recorría `Object.values` del dato CRUDO para juntar todo lo que fuera string.
 * Su propio docblock declaraba la intención correcta —«un volcado del Json crudo metería ids,
 * flags y claves internas al prompt»— y hacía exactamente eso: en las secciones curadas del
 * kickoff la primera key es el identificador, así que **los UUID de las franjas y los cuid del
 * equipo venían viajando al prompt en cada turno**.
 *
 * Había DOS renderers de contenido y solo uno consultaba el esquema. Ahora hay uno:
 * `renderSeccionParaElChat` (lib/canvas/capacidades-de-documento.ts), que recorre SOLO lo que el
 * esquema declara y numera los ítems desde 0 — el mismo número que va en `posicion`.
 */
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
  /**
   * El equipo de Smarteam, cuando el documento tiene una sección que nombra personas (hoy: el
   * kickoff).
   *
   * ⚠ Viaja por DOS motivos y los dos importan: entra al texto para que el modelo proponga nombres
   * que existen, y se devuelve crudo para que el servidor arme el mismo completador que el editor
   * — sin eso, el dry-run aceptaría «Juan» y el editor lo rechazaría al aplicar.
   */
  directorio?: { id: string; name: string; area?: string | null; roleEnum?: string | null; photoUrl?: string | null }[];
  /**
   * ⭐ El material del «Contexto del cronograma» — SOLO en la pieza cronograma (ver la EXCEPCIÓN
   * del header). Va en su PROPIO bloque del `system`, NO dentro de `texto`: el material cambia
   * cuando el CSE toca lo elegido y el contexto cambia en cada apply, así que cada uno lleva su
   * breakpoint de caché. Por eso `TECHO_DEL_PREFIJO_CHARS` no lo mide: tiene su propio techo
   * (`TECHO_DEL_MATERIAL_DEL_CHAT_CHARS`).
   *
   * `lectura` son solo números, para la línea de la pantalla. `interno` son los textos que
   * entraron, para marcar la frontera en las líneas del acuerdo: ⛔ no se renderizan ni viajan.
   */
  material?: { texto: string; lectura: LecturaDelMaterial; interno: readonly string[] };
}

/** Lo que decide la línea «PARA REHACER TODO» — ver `lineaParaRehacerTodo`. */
export interface EstadoParaRehacerTodo {
  /** Hay tareas AGENT o MODIFIED: el `hasAiDetail` de la pantalla. */
  conDetalleDeLaIA: boolean;
  /** Se subió al cliente al menos una vez (`publishedSnapshot`): el `hasPublishedOnce` de la pantalla. */
  publicadoAlgunaVez: boolean;
  /** Hay cambios de fases guardados sin decidir (`pendingProposal`, del handoff o del paso 1). */
  cambiosDeFasesSinDecidir: boolean;
  /** Lo guardado es el borrador VACÍO que espera sus tareas (`estadoDelVacio` = «armando»): la IA las
   *  está armando y todavía no hay nada que decidir ni barra donde hacerlo. */
  armandoTareas?: boolean;
  /** El mismo borrador VACÍO con su corrida fallida o colgada (`estadoDelVacio` = «fallo»): no va a
   *  llegar nada, se descarta (o se vuelve a intentar) en la línea de arriba del Gantt. */
  tareasFallaron?: boolean;
}

/**
 * ⭐ LA LÍNEA «PARA REHACER TODO» DEL CONTEXTO: qué botón rehace el cronograma desde las reuniones
 * y las notas elegidas, o que hoy no hay ninguno.
 *
 * Sigue las MISMAS condiciones que los botones de arriba del Gantt (CronogramaCanvas.tsx):
 *   · «Generar cronograma»: sin tareas de la IA y NUNCA publicado. Una propuesta solo de fases
 *     (`hayBorrador`) no lo esconde; una vista previa de tareas, sí.
 *   · «Regenerar todo el cronograma»: con tareas de la IA y SIN ninguna propuesta pendiente.
 *   · Publicado y sin tareas de la IA: ninguno de los dos (la pantalla muestra «Chequear avance»).
 * Lo que el servidor no sabe —los permisos de quien mira (editar el cronograma y generarlo o
 * regenerarlo con IA) y una vista previa que vive solo en su pantalla— va dicho como condición: la línea no puede afirmar algo falso. Revisión del paso C
 * (2026-09-24): recomendaba «Generar cronograma» en un cronograma publicado, donde no se ve, y
 * decía que ninguno se veía con una propuesta pendiente.
 */
export function lineaParaRehacerTodo(e: EstadoParaRehacerTodo): string {
  const cabeza = "PARA REHACER TODO desde las reuniones y las notas elegidas: ";
  /* Los botones que existen (E1, 2026-09-24): la propuesta se revisa en SU barra, arriba del Gantt
     —se desmarca lo que no va y «Aplicar», o «Descartar»—. Ya no se acepta ni descarta uno por uno. */
  const revisar = "se revisa la propuesta en su barra («Aplicar» lo marcado, o «Descartar»)";
  /* Cierre de la revisión de E2a: el borrador VACÍO cuya corrida murió no se llena solo. La línea de
     arriba del Gantt tiene «Descartar» (y «Volver a intentar» con permiso). */
  const vacioFallido =
    "hay una propuesta vacía porque la IA no pudo armar las tareas: primero se saca con «Descartar» (o " +
    "«Volver a intentar») arriba del Gantt";
  if (!e.conDetalleDeLaIA && e.publicadoAlgunaVez) {
    return (
      cabeza +
      "hoy NO hay botón. El cronograma ya se subió al cliente y no tiene tareas de la IA, y la pantalla no " +
      "ofrece generarlo de nuevo. Dilo así y atiende acá lo que pida, cambio por cambio."
    );
  }
  if (!e.conDetalleDeLaIA) {
    return (
      cabeza +
      "el botón «Generar cronograma», arriba del Gantt. Solo lo ve quien puede editar el cronograma y " +
      "tiene permiso de generarlo con IA, y se esconde mientras haya en pantalla una vista previa de " +
      "tareas sin decidir." +
      (e.cambiosDeFasesSinDecidir
        ? e.armandoTareas
          ? " Ahora la IA está armando las tareas: hay que esperar a que termine."
          : e.tareasFallaron
            ? ` Ahora ${vacioFallido}.`
            : ` Con una propuesta sin decidir, primero ${revisar} y después se genera.`
        : "")
    );
  }
  if (e.cambiosDeFasesSinDecidir && e.armandoTareas) {
    return (
      cabeza +
      "el botón «Regenerar todo el cronograma», arriba del Gantt, pero hoy NO se ve: la IA está armando " +
      "las tareas. Hay que esperar a que termine. Solo lo ve quien puede editar el cronograma y tiene " +
      "permiso de regenerarlo con IA."
    );
  }
  if (e.cambiosDeFasesSinDecidir && e.tareasFallaron) {
    return (
      cabeza +
      `el botón «Regenerar todo el cronograma», arriba del Gantt, pero hoy NO se ve: ${vacioFallido}. ` +
      "Solo lo ve quien puede editar el cronograma y tiene permiso de regenerarlo con IA."
    );
  }
  if (e.cambiosDeFasesSinDecidir) {
    return (
      cabeza +
      "el botón «Regenerar todo el cronograma», arriba del Gantt, pero hoy NO se ve: hay una propuesta " +
      `sin decidir. Primero ${revisar}, y después vuelve. Solo lo ve quien puede editar el cronograma y ` +
      "tiene permiso de regenerarlo con IA."
    );
  }
  return (
    cabeza +
    "el botón «Regenerar todo el cronograma», arriba del Gantt. Solo lo ve quien puede editar el " +
    "cronograma y tiene permiso de regenerarlo con IA, y se esconde mientras haya en pantalla una " +
    "vista previa sin decidir."
  );
}

/**
 * ⛔ CON CAMBIOS DE FASES SIN DECIDIR, LO QUE ACUERDE EL CHAT NO SE APLICA (revisión adversarial,
 * 2026-09-24). La pantalla corta el «Aplicar» mientras haya una propuesta de fases pendiente (la del
 * handoff o la de la revisión de «Regenerar todo»): guardar con motivo la borraría. El modelo no lo
 * sabía: armaba la lista numerada, el CSE la revisaba y «Aplicar» fallaba siempre. "" sin propuesta.
 * E2a: la propuesta de «Regenerar todo» trae fases Y tareas, así que la línea ya no dice «cambios de
 * fases» (el nombre de la función se queda: lo citan las guardas).
 */
export function lineaDeCambiosDeFasesSinDecidir(hay: boolean, vacio: EstadoDelVacio | null = null): string {
  if (!hay) return "";
  /* Revisión de E2a: el borrador VACÍO que espera sus tareas no tiene barra ni nada que decidir;
     decirle al modelo que «primero hay que resolver esa propuesta en su barra» era mandar al CSE a
     un botón que no existe. Lo que sí es verdad: mientras la IA arma, nada de lo acordado se aplica.
     Cierre de la revisión: la línea de arriba del Gantt sí tiene «Descartar» (callarlo dejaba al CSE
     esperando sin saber que podía salir), y con la corrida muerta no hay nada que esperar. */
  if (vacio === "armando") {
    return (
      "⏳ LA IA ESTÁ ARMANDO LAS TAREAS DEL CRONOGRAMA (arriba del Gantt dice «Armando las tareas…»). " +
      "Mientras tanto, NINGÚN cambio que acuerdes se puede aplicar: la pantalla lo frena. Si te piden un " +
      "cambio, dilo ANTES de armar la lista: hay que esperar a que termine (o «Descartar» en esa línea). " +
      "Puedes conversar el cambio y dejarlo para después."
    );
  }
  if (vacio === "fallo") {
    return (
      "⚠ LA IA NO PUDO ARMAR LAS TAREAS DEL CRONOGRAMA y quedó una propuesta vacía arriba del Gantt. " +
      "Mientras esté, NINGÚN cambio que acuerdes se puede aplicar: la pantalla lo frena. Si te piden un " +
      "cambio, dilo ANTES de armar la lista: primero hay que sacarla con «Descartar» (o «Volver a " +
      "intentar») en esa línea. Puedes conversar el cambio y dejarlo para después."
    );
  }
  return (
    "⛔ HAY UNA PROPUESTA DEL CRONOGRAMA SIN DECIDIR arriba del Gantt (del handoff, o de «Regenerar todo» " +
    "con fases y tareas). Mientras esté, NINGÚN cambio que acuerdes se puede aplicar: la pantalla " +
    "lo frena. Si te piden un cambio, dilo ANTES de armar la lista: primero hay que resolver esa propuesta en " +
    "su barra (desmarcar lo que no va y «Aplicar», o «Descartar»). Puedes conversar el " +
    "cambio y dejarlo para después."
  );
}

/**
 * El contexto del chat sobre el CRONOGRAMA.
 *
 * Trae las fases con su id y, debajo, sus tareas por semana con su título, su handle y su estado
 * (desde el 2026-08-21: sin títulos el chat no podía nombrar la tarea que le pedían mover). Las
 * NOTAS de las tareas siguen afuera. Las reuniones elegidas, las notas del CSE y las
 * instrucciones adicionales NO van acá: van en su propio bloque (`materialDelCronograma`).
 */
export async function contextoDeCronograma(projectId: string): Promise<ContextoDelAsistente> {
  /* Los `count` dicen SI hay algo en dos columnas Json sin traerlas (la foto publicada pesa lo que
     el cronograma entero): alimentan la línea «PARA REHACER TODO» (`lineaParaRehacerTodo`). */
  const [timeline, publicaciones, propuestasPendientes] = await Promise.all([
    prisma.projectTimeline.findUnique({
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
    }),
    prisma.projectTimeline.count({ where: { projectId, publishedSnapshot: { not: Prisma.DbNull } } }),
    prisma.projectTimeline.count({ where: { projectId, pendingProposal: { not: Prisma.DbNull } } }),
  ]);
  if (!timeline) {
    return { texto: "Este proyecto todavía no tiene cronograma.", cierreActual: null };
  }
  /* El borrador VACÍO que espera sus tareas, y si su corrida sigue viva (`leerEstadoDelVacio`). Cierre
     de la revisión de E2a: se contaba con un filtro JSON de Prisma que nunca se corrió contra la base y
     que, si fallaba, volvía EN SILENCIO al texto de «decidir la propuesta». Ahora se lee el JSON (solo
     si hay una propuesta) y se evalúa en JS, con la misma regla que la pantalla. */
  const vacio =
    propuestasPendientes > 0
      ? await leerEstadoDelVacio(
          (await prisma.projectTimeline.findUnique({ where: { projectId }, select: { pendingProposal: true } }))
            ?.pendingProposal ?? null,
        )
      : null;

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

  /**
   * ⭐ QUÉ BOTÓN REHACE TODO, según el estado — el que el CSE ve arriba del Gantt (o que no hay
   * ninguno). Las condiciones son las de la pantalla; ver `lineaParaRehacerTodo`. Va en el
   * CONTEXTO y no en el prompt: el prompt es el mismo para todos los hilos (y así se cachea entre
   * proyectos); el estado es de este cronograma.
   */
  const conDetalleDeLaIA = timeline.phases.some((f) =>
    f.tasks.some((t) => t.source === "AGENT" || t.source === "MODIFIED"),
  );
  const paraRehacerTodo = lineaParaRehacerTodo({
    conDetalleDeLaIA,
    publicadoAlgunaVez: publicaciones > 0,
    cambiosDeFasesSinDecidir: propuestasPendientes > 0,
    armandoTareas: vacio === "armando",
    tareasFallaron: vacio === "fallo",
  });

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
    ...(timeline.phases.length > 0 ? ["", paraRehacerTodo] : []),
    ...(propuestasPendientes > 0 ? ["", lineaDeCambiosDeFasesSinDecidir(true, vacio)] : []),
    "",
    /* ⚠ Decía «REGLAS DURAS DEL MODIFICADOR (lo que va a pasar cuando ejecute la instrucción)»: de
       cuando el chat emitía una instrucción que un segundo modelo ejecutaba. Desde el 2026-08-20
       emite operaciones que el código escribe tal cual, y desde el 2026-09-23 lee las reuniones:
       decirle que después corre un editor con contexto era invitarlo a dejarle el trabajo a nadie. */
    "REGLAS DURAS DEL CRONOGRAMA (las comparte con «Pedir cambio con IA»). Tus operaciones las",
    "escribe el código TAL CUAL, sin otro modelo detrás que las revise: lo que pongas en `titulo` y",
    "en `nombre` es lo que ve el cliente. Lo de conservar ids u omitir para borrar es de ese otro",
    "agente; tú borras y cambias con las operaciones:",
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
 * ⭐ EL MATERIAL DEL CRONOGRAMA PARA EL CHAT — la única puerta (ver la EXCEPCIÓN del header).
 *
 * ⚠ SI FALLA, EL CHAT SIGUE: una transcripción ilegible, la base lenta o `unstable_cache` fuera
 * de Next (`scripts/probar-asistente.ts`) no pueden convertir el turno en un 502. Contesta solo
 * con el cronograma y la pantalla lo dice en ámbar (`LECTURA_CON_ERROR`). Y el MODELO también lo
 * sabe: en el lugar del material va `AVISO_DEL_MATERIAL_ILEGIBLE`. Con el texto vacío entendía
 * «no eligió nada» y le pedía al CSE elegir lo que ya había elegido (revisión del paso C,
 * 2026-09-24).
 *
 * ⛔ NO se llama desde `contextoDeCronograma`: lo llama `turno.ts` en paralelo, y solo en la
 * pieza cronograma. Los kickoffs, la Entrega y Roles no pagan esta lectura.
 */
export async function materialDelCronograma(
  projectId: string,
): Promise<NonNullable<ContextoDelAsistente["material"]>> {
  try {
    const m = await cargarMaterialParaElChat(projectId);
    return { texto: m.texto, lectura: m.lectura, interno: m.materialInterno };
  } catch (e) {
    console.warn("[asistente] no se pudo leer el material del cronograma", {
      projectId,
      error: e instanceof Error ? e.message : e,
    });
    return { texto: AVISO_DEL_MATERIAL_ILEGIBLE, lectura: LECTURA_CON_ERROR, interno: [] };
  }
}

/**
 * El contexto del chat sobre un DOCUMENTO (kickoff, desarrollo, entrega…).
 *
 * ⚠ Trae las secciones con su rótulo y si tienen contenido — nunca el contenido. Un kickoff
 * generado son ~20.000 caracteres, y el chat no los necesita para entender «reescribí el alcance
 * en dos párrafos»: los necesita el assist del documento, que ya los carga.
 */
export async function contextoDeDocumento(
  dueno: Dueno,
  pieza: string,
): Promise<ContextoDelAsistente> {
  /**
   * ⚠ El canvas se busca por el DUEÑO, no siempre por proyecto.
   *
   * La propuesta comercial cuelga de un `BusinessCase` y además está VERSIONADA: cada «Generar»
   * crea un canvas nuevo y `isActive` marca el vivo. Buscar sin ese filtro traería una versión
   * anterior — se conversaría sobre un documento que ya nadie edita, y las operaciones caerían
   * sobre secciones que en la versión viva tienen otro id.
   */
  const canvas = await prisma.projectCanvas.findFirst({
    where:
      "projectId" in dueno
        ? { projectId: dueno.projectId, ...canvasOf(pieza) }
        : { businessCaseId: (dueno as { businessCaseId: string }).businessCaseId, isActive: true },
    select: {
      name: true,
      businessCaseId: true,
      /* La plantilla resuelve las defs de la propuesta comercial: sus secciones no salen de un
         registro fijo sino del TIPO DE CASO (HubSpot, sitio web…), que vive en el business case. */
      businessCase: { select: { id: true, caseType: true, caseSubtype: true } },
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
          /* ⭐ EL RÓTULO CHICO DE ARRIBA («LO QUE BUSCAMOS», «QUÉ CAMBIA»). Se ve en pantalla y
             no estaba en el contexto, así que para el modelo no existía: cuando le pedían
             cambiarlo, apuntaba al texto introductorio —lo más parecido que sí veía— y la
             persona aprobaba un cambio que no era el que había pedido. */
          eyebrowOverride: true,
          _count: { select: { blocks: true } },
          /* ⭐ `content` ES EL CUERPO DE LAS SECCIONES EN PROSA, y no estaba seleccionado: para el
             modelo, un documento anterior al motor no tenía contenido. La firma decía «— sin
             contenido legible» sobre una sección que en pantalla se lee entera, así que cuando le
             pedían resumirla escribía campos —lo único que sí veía— y la convertía en tarjetas,
             borrando el texto de la pantalla. Ver `formatoDeSeccion`. */
          blocks: { orderBy: { order: "asc" }, select: { id: true, data: true, blockType: true, content: true } },
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
  /**
   * ⭐ EL MISMO RENDERER QUE EL DE LA SECCIÓN COMPLETA, y eso cierra dos cosas a la vez.
   *
   * Había DOS renderers de contenido y solo uno respetaba el esquema. `textoDeBloque` recorría
   * `Object.values` del dato CRUDO, así que **los UUID de equipo y horarios venían viajando al
   * prompt en cada turno** — no solo en la línea del acuerdo, que es donde Elías los vio. El
   * otro ya declaraba la regla correcta en su propio docblock: «ids, banderas y el contenido
   * que curó una persona fuera del esquema no cruzan al prompt».
   *
   * Un solo dueño ⇒ esa regla pasa a ser verdad en todos lados. Y de paso el modelo ve las
   * POSICIONES numeradas también en el prefijo, que antes solo tenía con el chip puesto.
   */
  const renderDeContenido = (schema: unknown, bloques: { data: unknown }[]): string =>
    bloques
      .map((b) => renderSeccionParaElChat(schema, b.data, TOPE_POR_SECCION_CHARS))
      .filter((t) => t && !t.startsWith("(esta sección"))
      .join("\n");

  /* ⚠ Las defs se resuelven ACÁ ARRIBA, antes del render, porque de ellas sale la FIRMA de cada
     sección — y son las MISMAS que después alimentan al ejecutor. Una sola fuente: si el modelo
     leyera una forma y el ejecutor validara contra otra, volveríamos al fallo del 2026-08-22.
     ⚠ NO sale solo de `DOC`: ése es el registro del ASSIST. Exploración conversa sin estar ahí
     (ver `lib/asistente/piezas.ts`), y la propuesta comercial resuelve sus defs por PLANTILLA. */
  const defs = canvas.businessCase
    ? defsForCanvas(resolveCaseTypeFor(canvas.businessCase).templateId, canvas.canvasSections)
    : (DOC[pieza]?.defs ?? (pieza === "exploration" ? EXPLORACION_DEF_BY_KEY : {}));

  /**
   * ⛔ LA DEF DE UNA SECCIÓN CREADA A MANO SE SINTETIZA, igual que en el navegador.
   *
   * Las `custom:*` no están en la plantilla —las creó una persona— así que `defs[key]` es
   * `undefined` y su esquema salía vacío: el modelo la veía como «[sin campos editables]» y
   * cualquier cambio moría con «X no es un campo de esa sección». O sea que el chat podía CREAR
   * una sección y después no podía tocarla nunca más.
   *
   * ⚠ El ejecutor del navegador ya hacía este fallback. Que las dos mitades resuelvan distinto es
   * el modo de falla que `schemaParaElChat` existe para impedir.
   */
  const defDeSeccion = (
    porDef: Record<string, BCSectionDef | undefined>,
    key: string,
    label: string,
  ) => porDef[key] ?? (esCustomKey(key) ? customDef(key, label) : undefined);

  /* ⚠ El bloque CARD, no el primero: una sección puede arrastrar un TEXT legacy adelante, y ahí
     el contenido —y las anclas que se calculan de él— saldrían del objeto equivocado. */
  const cardDe = (bloques: { data: unknown; blockType: string }[]) =>
    bloques.find((b) => b.blockType === "CARD") ?? bloques[0];

  const secciones = canvas.canvasSections
    .map(
      (s: {
        key: string;
        label: string;
        eyebrowOverride: string | null;
        _count: { blocks: number };
        blocks: { id: string; data: unknown; blockType: string; content: string | null }[];
      }) => {
        const def = defDeSeccion(defs, s.key, s.label);
        /* ⭐ LA FIRMA ES LO QUE FALTABA. Sin ella el modelo tenía que adivinar cómo se llamaban
           las listas y los campos para poder nombrarlos, y el ejecutor los rechazaba. */
        /* ⛔ La firma DEPENDE DEL FORMATO. Una sección en prosa tiene un esquema de campos, pero
           escribir cualquiera de ellos borra el texto: anunciarlos es ofrecer justo lo que el
           ejecutor rechaza. Ver `FIRMA_DE_TEXTO_CORRIDO`. */
        const formatoDeEsta = formatoDeSeccion(datosDeSeccion(s.blocks));
        const firma =
          formatoDeEsta === "prosa"
            ? FIRMA_DE_TEXTO_CORRIDO
            : firmaDeSeccion(schemaParaElChat(def), def?.listasSoloEdicion);
        /* El de su clase, más el propio de esta sección si lo declara. */
        const avisos = [
          AVISO_DE_CAPACIDAD_PARA_EL_CHAT[capacidadDeSeccion(def, esCustomKey(s.key))],
          def?.avisoDelChat ?? "",
        ].filter(Boolean);
        const aviso = avisos.join(" · ");
        /* El MISMO nombre que el chip. Con dos, el modelo recibe dos rótulos para la sección de
           la que se está hablando y el pedido de la persona no coincide con nada. */
        const nombre = nombreParaElChat(def, s.label);
        const alias = s.label.trim() && s.label.trim() !== nombre ? ` — en pantalla: «${s.label}»` : "";
        /* El EFECTIVO, no el override: lo que se lee en pantalla es lo escrito a mano si lo hay,
           y si no el de la plantilla. Mostrar solo el override dejaría mudas a las secciones que
           nunca se renombraron, que son casi todas. */
        const rotulo = (s.eyebrowOverride ?? def?.eyebrow ?? "").trim();
        const lineaDeRotulo = rotulo ? ` · rótulo de arriba: «${rotulo}»` : "";
        const cabecera = `- ${nombre} (${s.key}) ${firma}${lineaDeRotulo}${alias}${aviso ? ` — ${aviso}` : ""}`;
        if (s._count.blocks === 0) return `${cabecera} — VACÍA`;
        /* ⭐ EL FORMATO EN EL QUE LA SECCIÓN SE VE, dicho antes que su contenido. La regla de
           Elías —«cada sección se edita en el formato en el que está»— no la puede cumplir un
           modelo que no sabe en qué formato está. Y el ejecutor rechaza escribir campos acá, así
           que decirlo también ahorra el turno entero que se gasta en una operación que va a
           rebotar. */
        /* ⛔ EL MISMO renderer que el bloque del chip y el del reintento. Eran tres textos del
           cuerpo de una sección escritos por separado, y el del chip —que es el último que el
           modelo lee— decía lo contrario que éste sobre las secciones en prosa. */
        const cuerpo = cuerpoDeSeccionParaElChat(
          {
            /* ⛔ `datosDeSeccion`, no los argumentos a mano: `cardDe` cae al PRIMER bloque cuando
               no hay CARD, así que sobre una sección legacy tomaba el bloque de TEXTO y su `data`
               entraba como contenido tipado. El servidor decía «estructurado» donde el motor
               pintaba prosa, y el chat afirmaba que la sección estaba vacía. */
            formato: formatoDeEsta,
            schema: schemaParaElChat(def),
            data: cardDe(s.blocks)?.data,
            bloquesDeTexto: s.blocks
              .filter((b) => b.blockType !== "CARD")
              .map((b) => ({ contenido: b.content ?? "" })),
          },
          TOPE_POR_SECCION_CHARS,
        );
        if (!cuerpo.trim() || cuerpo.startsWith("(esta sección")) {
          return `${cabecera} — sin contenido legible`;
        }
        return `${cabecera}:\n    ${cuerpo.replace(/\n/g, "\n    ")}`;
      },
    )
    .join("\n");

  /**
   * ⭐ EL EQUIPO, solo cuando este documento nombra personas.
   *
   * Elías pidió agregar y quitar gente del kickoff por su nombre. Sin la lista, el modelo propone
   * nombres inventados y el completador los rechaza uno por uno — una conversación de tres turnos
   * para agregar a alguien que estaba ahí. Con la lista, propone bien la primera vez.
   *
   * ⚠ Se pide SOLO si la pieza tiene una sección de equipo: son ~20 filas, pero es una consulta
   * más en el camino caliente de cada turno, y en los otros nueve documentos no significa nada.
   */
  const necesitaDirectorio = canvas.canvasSections.some((s) => s.key === "equipo");
  const directorio = necesitaDirectorio
    ? await prisma.teamMember.findMany({
        /* El MISMO filtro que `/api/team`, que es de donde el editor saca su lista: la baja es
           blanda, así que quien se fue no tiene que poder entrar a un kickoff nuevo. */
        where: { deactivatedAt: null },
        select: { id: true, name: true, area: true, roleEnum: true, photoUrl: true },
        orderBy: { name: "asc" },
      })
    : undefined;

  /* `project` es nullable en el schema porque un ProjectCanvas puede colgar de un BusinessCase.
     Acá filtramos por projectId, así que en la práctica está — pero se maneja igual: un `!` acá
     sería una promesa sobre una consulta que alguien puede cambiar después. */
  const identidad = canvas.project
    ? `PROYECTO: ${canvas.project.name} — cliente ${canvas.project.client.name}`
    : canvas.businessCaseId
      ? "DOCUMENTO DE VENTAS: una propuesta comercial"
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
    ...(directorio?.length
      ? [
          "",
          "EQUIPO DE SMARTEAM (para la sección «equipo»): nombra a la persona TAL CUAL aparece acá.",
          /* ⛔ «SI QUIERES» NO ALCANZABA. Decirle que el rol es opcional sin decirle qué pasa si lo
             omite lo dejaba sin saber si omitirlo era seguro — así que preguntaba. Visto en
             pantalla: «agregá a Elías» → «¿qué rol ocupa?», y al insistir, el modelo INVENTÓ que
             los roles eran una lista cerrada con los que ya estaban en la sección.
             Ahora el rol de cada uno viaja entre paréntesis y se dice qué pone la app sola. */
          "La identidad, la foto y el ROL los pone la app desde este directorio: basta el nombre.",
          "Solo mandas `role` si te piden uno DISTINTO del que tiene acá.",
          directorio
            .map((p) => {
              const rol = (p.area || p.roleEnum || "").trim();
              return rol ? `${p.name} (${rol})` : p.name;
            })
            .join(" · "),
        ]
      : []),
    "",
    /* ⛔ INTERPOLADAS, NO TRANSCRITAS. Hasta el 2026-08-22 acá había un párrafo escrito a mano que
       decía lo mismo que el prompt del chat — dos copias de la misma regla, y una de las dos ya
       estaba equivocada (afirmaba que no se pueden crear secciones nuevas, cuando la propuesta
       comercial las creaba desde el 2026-08-12). Ahora las dos salen del mismo archivo, y hay una
       guarda que impide volver a copiarlas. */
    "REGLAS DEL EDITOR (lo que va a pasar cuando se ejecute cada operación):",
    /* ⭐ POR PIEZA, no las mismas para todos: crear y ocultar dependen del documento, y
       prometerlos donde no existen hacía que el chat acordara algo que el ejecutor rechazaba —
       gastando además un reintento que no podía arreglar nada. */
    reglasDelDocumento(pieza),
    "",
    "OPERACIONES QUE EXISTEN — es una lista CERRADA:",
    operacionesParaElChat(),
    "",
    /* El catálogo solo tiene sentido donde se puede crear. Listarlo en un documento de lista fija
       es enseñarle al modelo nueve formas que no va a poder usar. */
    ...(capacidadesDeLaPieza(pieza).puedeCrear
      ? [
          "TIPOS DE SECCIÓN QUE SE PUEDEN CREAR — también cerrada. Si te piden una forma que no está",
          "aquí, dilo en vez de usar la más parecida:",
          catalogoParaElChat(),
          "",
        ]
      : []),
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
  const seccionesParaEjecutar: SeccionActual[] = canvas.canvasSections.map((s) => {
    const def = defDeSeccion(defs, s.key, s.label);
    const card = cardDe(s.blocks);
    return {
      id: s.id,
      key: s.key,
      label: s.label,
      data: card?.data ?? {},
      schema: schemaParaElChat(def),
      /* ⚠ El del AGENTE va aparte: `seccion.vaciar` lo usa para no llevarse la curaduría.
         Ver `schemaDelAgente` en el vocabulario. */
      schemaDelAgente: def?.schema,
      /* El ojo no entra al contexto del modelo —no cambia lo que se puede pedir— pero el
         ejecutor lo necesita para no proponer ocultar algo que ya está oculto. */
      oculta: false,
      esCreada: esCustomKey(s.key),
      movible: !def?.pinned,
      /* ⭐ La pregunta NO es «¿el motor le pinta encabezado?» sino «¿escribir el rótulo se va a
         VER?», y `selfTitled` contesta la primera. Falla en las dos direcciones: el cronograma y
         los procesos del kickoff son `selfTitled` y SÍ pintan lo que el motor les pasa, así que el
         chat rechazaba un rótulo que se habría visto. `leeElEncabezado` lo declara como un hecho
         en vez de inferirlo. */
      rotulable: !def?.selfTitled || !!def?.leeElEncabezado,
      rotulo: (s.eyebrowOverride ?? def?.eyebrow ?? "").trim(),
      /* Cómo se llama cada lista EN PANTALLA: es lo que hace legible la línea del acuerdo. */
      rotulosDeListas: def?.rotulosDeListas,
      /* Corregir sí, agrandar no. Ver `SeccionActual.listasSoloEdicion`. */
      listasSoloEdicion: def?.listasSoloEdicion,
      /* ⛔ El MISMO predicado que usa el motor para decidir qué pinta, y el mismo que corre en el
         navegador. Ver `SeccionActual.formato`: si las dos mitades lo dedujeran por su cuenta, la
         primera divergencia sería una pérdida de contenido silenciosa. */
      /* ⛔ La MISMA lectura que el motor. Ver `datosDeSeccion`: compartir el predicado no alcanza
         si cada llamador arma los argumentos por su cuenta. */
      formato: formatoDeSeccion(datosDeSeccion(s.blocks)),
      /* Solo lo usa `seccion.texto`: es el cuerpo de una sección escrita en prosa. */
      bloquesDeTexto: s.blocks
        .filter((b) => b.blockType !== "CARD")
        .map((b) => ({ id: b.id, contenido: b.content ?? "" })),
    };
  });

  return { texto, cierreActual: null, secciones: seccionesParaEjecutar, directorio };
}

function fmtFecha(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * ⭐ EL CONTEXTO DE UN DOCUMENTO DE ROLES — perfil de puesto o propuesta laboral.
 *
 * ── POR QUÉ ES UNA FUNCIÓN APARTE ────────────────────────────────────────────
 * Roles reusa el motor de PRESENTACIÓN del resto (LandingView, las mismas primitivas de edición)
 * pero NO su motor de datos: su contenido vive en `RoleProfile.content`, un Json por sección, y no
 * en filas de `CanvasSection` con bloques. Es una decisión escrita en `docs/DECISIONS.md`, no un
 * accidente. Forzarlo por el mismo camino habría significado inventarle un canvas que no tiene.
 *
 * Lo que sí es idéntico es todo lo demás: las mismas operaciones, las mismas líneas en castellano,
 * la misma cajita con casillas. La forma del contexto que devuelve es la misma — por eso el turno
 * no se entera de cuál de las dos leyó.
 *
 * ⚠ La KEY de la sección hace de id: en Roles no hay `CanvasSection.id`. El ejecutor de este
 * documento escribe por key contra `content`, así que es la identidad correcta acá.
 */
export async function contextoDeRol(roleId: string): Promise<ContextoDelAsistente> {
  const rol = await prisma.roleProfile.findUnique({
    where: { id: roleId },
    select: { title: true, area: true, summary: true, docType: true, content: true },
  });
  if (!rol) return { texto: "Ese documento ya no existe.", cierreActual: null };

  const contenido = (rol.content ?? {}) as Record<string, unknown>;
  /* ⚠ LA PORTADA NO VIVE EN `content`. Su título, área y resumen son COLUMNAS de la fila, y el
     motor las junta al pintar. Leyéndola de `content` el chat la vería vacía y —peor— al cambiar
     un campo escribiría `{title}` solo, borrando los otros dos: pérdida de datos silenciosa sobre
     el encabezado del documento. */
  const datosDe = (key: string): unknown =>
    key === "hero"
      ? { title: rol.title, area: rol.area ?? "", summary: rol.summary ?? "" }
      : (contenido[key] ?? {});
  /* ⛔ Las secciones salen de `sectionDefsForDocType`, NUNCA de `ROLE_SECTIONS`: ésas son las del
     PERFIL, y una propuesta laboral tiene otras keys. Con la lista fija del perfil, el chat sobre
     una propuesta habría visto siete secciones VACÍAS —las del otro documento— y habría rechazado
     cada operación sobre las que sí existen con «no es una sección de este documento». El mapa es
     `Record<RoleDocTypeValue, …>`, así que un tercer tipo de documento no compila hasta declararlo. */
  const secciones: SeccionActual[] = sectionDefsForDocType(rol.docType).map((def) => {
    const k = def.key;
    return {
      id: k,
      key: k,
      label: def.label ?? k,
      data: datosDe(k),
      /* ⚠ La MISMA función que el ejecutor. Mientras acá se leía el esquema del AGENTE y allá el
         del CHAT, un `schemaDelChat` en Roles no habría hecho nada: el dry-run del servidor
         seguiría rechazando lo que el editor sí sabe escribir. */
      schema: schemaParaElChat(def),
      /* ⚠ El del AGENTE va aparte: `seccion.vaciar` lo usa para no llevarse la curaduría.
         Ver `schemaDelAgente` en el vocabulario. */
      schemaDelAgente: def?.schema,
      oculta: false,
      esCreada: false,
      /* ⛔ La lista de secciones de un rol es FIJA: no se crean, no se borran y no se reordenan.
         El motor las arma siempre desde la plantilla del tipo, completa. */
      movible: false,
      /* ⛔ Y tampoco se renombran ni se rotulan: sus títulos salen de la plantilla del tipo,
         así que escribirlos no se vería. Se rechaza con el motivo en vez de decir «aplicado». */
      renombrable: false,
      rotulable: false,
    };
  });

  /* ⭐ LA FIRMA TAMBIÉN ACÁ. Sin ella el modelo tenía que adivinar los nombres de los campos de un
     perfil de puesto, y no son adivinables: `condiciones[texto, nota]`, `levels[level, titulo,
     alcance, impacto]`. Los inventaba y el ejecutor los rechazaba uno por uno.
     ⚠ Va TAMBIÉN en la rama vacía: una sección sin contenido es justo donde más falta saber qué
     campos tiene para poder llenarla. */
  const renglones = secciones.map((s) => {
    const firma = firmaDeSeccion(s.schema, s.listasSoloEdicion);
    const texto = renderSeccionParaElChat(s.schema, s.data, TOPE_POR_SECCION_CHARS);
    if (!texto.trim() || texto.startsWith("(esta sección")) return `- ${s.label} (${s.key}) ${firma} — VACÍA`;
    return `- ${s.label} (${s.key}) ${firma}:\n    ${texto}`;
  });

  const texto = [
    `DOCUMENTO: ${rol.docType === "PROPUESTA" ? "propuesta laboral" : "perfil de puesto"} — ${rol.title}`,
    rol.area ? `ÁREA: ${rol.area}` : "",
    rol.summary ? `RESUMEN: ${rol.summary}` : "",
    "",
    "SECCIONES, con su contenido. Entre paréntesis va la KEY: nómbrala en las operaciones.",
    renglones.join("\n") || "(sin secciones)",
    "",
    "REGLAS DEL EDITOR (lo que va a pasar cuando se ejecute cada operación):",
    /* ⚠ Por pieza también acá: la constante suelta prometía crear y ocultar, y dos renglones más
       abajo este mismo bloque decía que las secciones de un rol son fijas. El contexto se
       contradecía solo. */
    reglasDelDocumento(PIEZA_ROL),
    "",
    "OPERACIONES QUE EXISTEN — es una lista CERRADA:",
    operacionesParaElChat(),
    "",
    "⛔ EN ESTE DOCUMENTO las secciones son FIJAS: no se crean, no se borran, no se ocultan y no",
    "se mueven. Solo se cambia su contenido. Si te piden otra cosa, dilo.",
    "",
    "CONSECUENCIAS QUE HAY QUE DECIR ANTES, no después de aplicar:",
    ADVERTENCIAS_DEL_DOCUMENTO.map((a) => `- ${a.aviso}`).join("\n"),
  ]
    .filter(Boolean)
    .join("\n");

  return { texto, cierreActual: null, secciones };
}
