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
  AVISO_DE_CAPACIDAD_PARA_EL_CHAT,
  REGLAS_DURAS_DEL_DOCUMENTO,
  capacidadDeSeccion,
  catalogoParaElChat,
  schemaParaElChat,
  nombreParaElChat,
  firmaDeSeccion,
  operacionesParaElChat,
} from "@/lib/canvas/capacidades-de-documento";
import type { SeccionActual } from "@/lib/canvas/operaciones-de-documento";
import { DOC } from "@/lib/canvas/assist-de-documento";
import { EXPLORACION_DEF_BY_KEY } from "@/components/landing/configs/exploracion.defs";
import { defsForCanvas } from "@/components/landing/configs/templates.defs";
import { resolveCaseTypeFor } from "@/lib/business-cases/resolve-template";
import type { Dueno } from "./hilo";
import { esCustomKey } from "@/lib/landing/custom-sections";
import { prisma } from "@/lib/db/prisma";
import { sectionDefsForDocType } from "@/lib/roles/doc-type";
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
export const TOPE_POR_SECCION_CHARS = 1_000;

/**
 * Lo que se puede leer de un bloque. Los bloques son Json con formas distintas por tipo de
 * sección (texto, listas, tarjetas), así que se recorre y se junta lo que sea string.
 *
 * ⛔ Solo strings: un volcado del Json crudo metería ids, flags y claves internas al prompt —
 * ruido que el modelo puede citarle al CSE como si fuera contenido del documento.
 */
/** El recorte POR SECCIÓN, compartido por los dos armadores de contexto de documento. */
function recortarContenido(crudo: string): string {
  if (!crudo) return "";
  return crudo.length > TOPE_POR_SECCION_CHARS
    ? `${crudo.slice(0, TOPE_POR_SECCION_CHARS)}… (recortado — el editor sí lo lee entero)`
    : crudo;
}

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
  /**
   * El equipo de Smarteam, cuando el documento tiene una sección que nombra personas (hoy: el
   * kickoff).
   *
   * ⚠ Viaja por DOS motivos y los dos importan: entra al texto para que el modelo proponga nombres
   * que existen, y se devuelve crudo para que el servidor arme el mismo completador que el editor
   * — sin eso, el dry-run aceptaría «Juan» y el editor lo rechazaría al aplicar.
   */
  directorio?: { id: string; name: string; area?: string | null; roleEnum?: string | null; photoUrl?: string | null }[];
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
          _count: { select: { blocks: true } },
          blocks: { orderBy: { order: "asc" }, select: { data: true, blockType: true } },
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
  const renderDeContenido = (bloques: { data: unknown }[]): string =>
    recortarContenido(bloques.map((b) => textoDeBloque(b.data)).filter(Boolean).join(" · "));

  /* ⚠ Las defs se resuelven ACÁ ARRIBA, antes del render, porque de ellas sale la FIRMA de cada
     sección — y son las MISMAS que después alimentan al ejecutor. Una sola fuente: si el modelo
     leyera una forma y el ejecutor validara contra otra, volveríamos al fallo del 2026-08-22.
     ⚠ NO sale solo de `DOC`: ése es el registro del ASSIST. Exploración conversa sin estar ahí
     (ver `lib/asistente/piezas.ts`), y la propuesta comercial resuelve sus defs por PLANTILLA. */
  const defs = canvas.businessCase
    ? defsForCanvas(resolveCaseTypeFor(canvas.businessCase).templateId, canvas.canvasSections)
    : (DOC[pieza]?.defs ?? (pieza === "exploration" ? EXPLORACION_DEF_BY_KEY : {}));

  /* ⚠ El bloque CARD, no el primero: una sección puede arrastrar un TEXT legacy adelante, y ahí
     el contenido —y las anclas que se calculan de él— saldrían del objeto equivocado. */
  const cardDe = (bloques: { data: unknown; blockType: string }[]) =>
    bloques.find((b) => b.blockType === "CARD") ?? bloques[0];

  const secciones = canvas.canvasSections
    .map(
      (s: {
        key: string;
        label: string;
        _count: { blocks: number };
        blocks: { data: unknown; blockType: string }[];
      }) => {
        const def = defs[s.key];
        /* ⭐ LA FIRMA ES LO QUE FALTABA. Sin ella el modelo tenía que adivinar cómo se llamaban
           las listas y los campos para poder nombrarlos, y el ejecutor los rechazaba. */
        const firma = firmaDeSeccion(schemaParaElChat(def));
        const aviso = AVISO_DE_CAPACIDAD_PARA_EL_CHAT[capacidadDeSeccion(def, esCustomKey(s.key))];
        /* El MISMO nombre que el chip. Con dos, el modelo recibe dos rótulos para la sección de
           la que se está hablando y el pedido de la persona no coincide con nada. */
        const nombre = nombreParaElChat(def, s.label);
        const alias = s.label.trim() && s.label.trim() !== nombre ? ` — en pantalla: «${s.label}»` : "";
        const cabecera = `- ${nombre} (${s.key}) ${firma}${alias}${aviso ? ` — ${aviso}` : ""}`;
        if (s._count.blocks === 0) return `${cabecera} — VACÍA`;
        const contenido = recortarContenido(textoDeBloque(cardDe(s.blocks)?.data));
        return contenido ? `${cabecera}:\n    ${contenido}` : `${cabecera} — sin contenido legible`;
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
          "La identidad y la foto las pone la app; tú solo das el nombre y, si quieres, el rol.",
          directorio.map((p) => p.name).join(" · "),
        ]
      : []),
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
  const seccionesParaEjecutar: SeccionActual[] = canvas.canvasSections.map((s) => {
    const def = defs[s.key];
    const card = cardDe(s.blocks);
    return {
      id: s.id,
      key: s.key,
      label: s.label,
      data: card?.data ?? {},
      schema: schemaParaElChat(def),
      /* El ojo no entra al contexto del modelo —no cambia lo que se puede pedir— pero el
         ejecutor lo necesita para no proponer ocultar algo que ya está oculto. */
      oculta: false,
      esCreada: esCustomKey(s.key),
      movible: !def?.pinned,
      /* Cómo se llama cada lista EN PANTALLA: es lo que hace legible la línea del acuerdo. */
      rotulosDeListas: def?.rotulosDeListas,
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
      schema: def.schema ?? { type: "object", properties: {} },
      oculta: false,
      esCreada: false,
      /* ⛔ La lista de secciones de un rol es FIJA: no se crean, no se borran y no se reordenan.
         El motor las arma siempre desde la plantilla del tipo, completa. */
      movible: false,
    };
  });

  const renglones = secciones.map((s) => {
    const texto = textoDeBloque(s.data, 0);
    if (!texto.trim()) return `- ${s.label} (${s.key}) — VACÍA`;
    return `- ${s.label} (${s.key}):\n    ${recortarContenido(texto)}`;
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
    REGLAS_DURAS_DEL_DOCUMENTO,
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
