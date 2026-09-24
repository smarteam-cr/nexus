/**
 * lib/contexto/detalle-cronograma.ts — EL CONTEXTO NOMBRADO DE LA PRIMERA PIEZA MIGRADA.
 * Puro: sin Prisma, sin googleapis. El cargador server-side vive en `./cargar.ts`.
 *
 * ── QUÉ ES ESTO ──────────────────────────────────────────────────────────────
 * El userMessage del agente de Detalle de Cronograma, que antes se armaba inline en
 * analyze/route.ts (~50 líneas de template en un route de 3.300), ahora tiene DUEÑO:
 * las fuentes se nombran (`fuentesDelDetalle`), las reglas por clasificación se derivan
 * (`reglasDeClasificacion`) y el template vive en `renderDetalleDeCronograma`.
 *
 * REGLA DE ORO DE LA MIGRACIÓN: byte-idéntico. El golden del test transcribe el template
 * viejo de la ruta y afirma igualdad exacta — mover el armado acá NO puede cambiar ni un
 * carácter de lo que el agente ve. Cualquier mejora al prompt es un cambio aparte, visible
 * en el diff de ESTE archivo (que es todo el punto: antes era invisible dentro del route).
 * La primera mejora así (revisión adversarial, 2026-09-24): el texto pasó de voseo a tuteo, sin
 * cambiar qué pide; el golden la transcribe igual, con la razón escrita.
 *
 * ── POR QUÉ LAS FUENTES LLEVAN EL RÓTULO ADENTRO ─────────────────────────────
 * La lección de la Tanda H (el deal del vecino, el spread pisado): la procedencia que viaja
 * FUERA del texto se pierde por descuido de un call site. Acá cada FuenteDeContexto nace con
 * su `=== RÓTULO ===` pegado al contenido — no existe el estado "texto sin etiqueta".
 */
import { esReimplementacion } from "@/lib/tags/catalog";
import type { FuenteDeContexto } from "./tipos";

/* El fallback cuando no hay handoff confirmado. En tuteo desde la revisión adversarial del
   2026-09-24 (decía «Generá… marcá»): el texto para el modelo va en tuteo, y el golden de abajo
   fija la versión nueva con la razón escrita. */
const SIN_HANDOFF_CONFIRMADO =
  '(Sin handoff confirmado. Genera las tareas típicas del tipo de cada fase y marca CADA una con "porValidar": true. Títulos limpios, sin marcadores.)';

/**
 * El fallback SIN handoff pero CON material (reuniones elegidas o notas del CSE). El de arriba le
 * pedía marcar CADA tarea «por validar»: con reuniones enfrente, eso marcaba también las que salían
 * de lo que el cliente acordó. Acá solo se marcan las típicas, las que ninguna fuente respalda — y
 * esa marca ahora llega hasta la tarea creada (`needsValidation`, ver
 * lib/timeline/apply-curated-phase.ts), así que la promesa es real.
 */
export const SIN_HANDOFF_CON_MATERIAL =
  '(Sin handoff confirmado. Arma las tareas con las reuniones y las notas del CSE que vienen más abajo; solo donde no digan nada, propón las tareas típicas del tipo de fase y marca ESAS con "porValidar": true. Títulos limpios, sin marcadores.)';

/**
 * La válvula de «fase ya resuelta» cuando solo hay instrucciones del CSE. El texto que tenía la ruta
 * (lo fija el golden «con brief»), en tuteo desde la revisión adversarial del 2026-09-24.
 */
export const FASES_RESUELTAS_POR_INSTRUCCIONES =
  `\n\n=== FASES QUE LAS INSTRUCCIONES DAN POR RESUELTAS ===\nSi las instrucciones del CSE de arriba dicen que una fase concreta ya está terminada, resuelta o que no requirió trabajo, NO le propongas tareas: inclúyela en el JSON con su id EXACTO y "tasks": [] — se deja como está. Vale AUNQUE esa fase venga tarde en el orden del cronograma: el orden es la expectativa inicial del plan, no el orden real en que se hizo el trabajo. Concentra el detalle en las fases donde todavía hay trabajo por delante.`;

/**
 * La MISMA válvula cuando hay material (validación 2026-09-23): una reunión elegida o una nota del
 * CSE también pueden decir que una fase ya se hizo, y la de arriba solo habla de «las instrucciones
 * del CSE». Sin brief, el agente no tenía permiso de dejar quieta una fase que una reunión daba por
 * cerrada: le re-proponía sus tareas típicas.
 */
export const FASES_RESUELTAS_CON_MATERIAL =
  `\n\n=== FASES QUE YA ESTÁN RESUELTAS ===\nSi las instrucciones del CSE, una reunión elegida o una nota del CSE dicen que una fase concreta ya está terminada, resuelta o que no requirió trabajo, NO le propongas tareas: inclúyela en el JSON con su id EXACTO y "tasks": [] — se deja como está. Vale AUNQUE esa fase venga tarde en el orden del cronograma: el orden es la expectativa inicial del plan, no el orden real en que se hizo el trabajo. Concentra el detalle en las fases donde todavía hay trabajo por delante.`;

/**
 * Cuando el CSE regenera UNA fase y va la válvula de las fases resueltas: esa fase no entra en la
 * válvula (ver `renderDetalleDeCronograma`).
 */
export const EXCEPCION_DE_LA_FASE_A_REGENERAR =
  " Esta fase la pidió regenerar el CSE: detalla sus tareas aunque las instrucciones, una reunión o una nota la den por resuelta (la regla de las fases resueltas no vale para ella). Lo que ya se hizo va como tarea, igual que lo que falta.";

/** Las fuentes del «Contexto del cronograma» que cuentan como MATERIAL (el calendario no: solo ubica). */
const FUENTES_DE_MATERIAL = ["reuniones-del-cronograma", "notas-del-cronograma"] as const;

export interface EncabezadoDelDetalle {
  companyName: string;
  /** null → "No especificada" (la conducta histórica de la ruta). */
  industry: string | null;
  /** Falsy → la línea no se pinta. */
  serviceTypeLabel: string | null;
  classificationLabel: string | null;
}

/** Los tres hechos de negocio que deciden las reglas #6 y #7 del detalle. */
export interface ClasificacionDelDetalle {
  esReimplementacion: boolean;
  llevaMigracion: boolean;
  llevaDesarrollo: boolean;
}

/**
 * Deriva la clasificación desde los tags YA sanitizados.
 *
 * ⚠ 2026-08-12: antes recibía un segundo parámetro `implementationType` que salía de una columna
 * propia. Los tres hechos son de la misma naturaleza —cómo se clasifica el proyecto— y ahora los
 * tres salen de la MISMA lista. El texto que esta clasificación produce (`reglasDeClasificacion`)
 * no cambió ni un carácter: lo que cambió es de dónde sale el dato.
 */
export function clasificacionDeTags(tagSlugs: readonly string[]): ClasificacionDelDetalle {
  return {
    esReimplementacion: esReimplementacion([...tagSlugs]),
    llevaMigracion: tagSlugs.includes("crm_migration"),
    llevaDesarrollo: tagSlugs.includes("custom_dev") || tagSlugs.includes("insider_one"),
  };
}

/**
 * Las reglas #6 (base de datos) y #7 (tareas técnicas) — el texto EXACTO que tenía la ruta.
 * Re-implementación sin migración ⇒ revisar/limpiar la base existente, no cargarla.
 */
export function reglasDeClasificacion(c: ClasificacionDelDetalle): string {
  const dbTaskRule = c.esReimplementacion && !c.llevaMigracion
    ? `- BASE DE DATOS (#6): es una RE-IMPLEMENTACIÓN sobre un HubSpot que el cliente YA usa, SIN migración desde otro CRM. NO incluyas una tarea de "cargar/crear la base de datos"; en su lugar, en la primera fase, incluye una tarea de REVISIÓN DE ESTRUCTURA Y LIMPIEZA de la base existente (propiedades, duplicados, datos sucios).`
    : `- BASE DE DATOS (#6): ${c.esReimplementacion ? "es una re-implementación pero CON migración desde otro CRM" : "es una implementación desde cero"}, así que SÍ incluye en la primera fase una tarea de CARGAR/ESTRUCTURAR LA BASE DE DATOS (importar y modelar los datos en HubSpot).`;
  const techRule = c.llevaDesarrollo
    ? `\n- DESARROLLO/INTEGRACIÓN (#7): el proyecto lleva desarrollo a medida o Insider One. Las tareas técnicas (integraciones, desarrollo, APIs) márcalas con responsable "DEV" y, si existe una fase de "Desarrollo / Integración", ubícalas SOLO ahí (no las mezcles con las tareas funcionales de otras fases).`
    : "";
  return `${dbTaskRule}${techRule}`;
}

/**
 * Las fuentes NOMBRADAS del detalle, cada una con su rótulo adentro.
 * "" en el texto = la fuente no aporta hoy (el render la saltea con su separador correcto).
 */
export function fuentesDelDetalle(crudas: {
  timelineCtx: string;
  handoffCtx: string;
  desarrolloCtx: string;
  /**
   * «Contexto del cronograma» (2026-09-23): las reuniones que el CSE deja entrar y sus notas, YA
   * rotuladas por `lib/contexto/material-cronograma.ts`. Opcionales y SOLO se agregan con texto:
   * sin material, la lista de fuentes y el mensaje quedan idénticos a los de antes (el golden lo
   * afirma).
   */
  reunionesCtx?: string;
  notasCtx?: string;
  /**
   * El calendario de SOLO LECTURA del plan (`calendarioDelCronograma`, sin «Hoy»: con él el modelo
   * vaciaba las semanas pasadas aunque su trabajo no estuviera hecho). Entra SOLO con material —
   * sirve para ubicar lo que dicen las reuniones y las notas; sin ellas es ruido y rompería el
   * golden —, y va ANTES de las reuniones, que citan sus semanas.
   */
  calendarioCtx?: string;
}): FuenteDeContexto[] {
  const hayMaterial = !!(crudas.reunionesCtx?.trim() || crudas.notasCtx?.trim());
  const delContexto: FuenteDeContexto[] = [];
  if (hayMaterial && crudas.calendarioCtx?.trim()) {
    delContexto.push({ key: "calendario-del-cronograma", ambito: "proyecto", texto: crudas.calendarioCtx });
  }
  if (crudas.reunionesCtx?.trim()) {
    delContexto.push({ key: "reuniones-del-cronograma", ambito: "proyecto", texto: crudas.reunionesCtx });
  }
  if (crudas.notasCtx?.trim()) {
    delContexto.push({ key: "notas-del-cronograma", ambito: "proyecto", texto: crudas.notasCtx });
  }
  return [
    {
      key: "cronograma-actual",
      ambito: "proyecto",
      texto: `=== CRONOGRAMA A DETALLAR (fases EXISTENTES — no cambies nombres, duraciones ni orden) ===\n${crudas.timelineCtx}`,
    },
    {
      key: "handoff-curado",
      ambito: "proyecto",
      texto: `=== HANDOFF CURADO (bloques confirmados por el CSE) ===\n${
        crudas.handoffCtx || (hayMaterial ? SIN_HANDOFF_CON_MATERIAL : SIN_HANDOFF_CONFIRMADO)
      }`,
    },
    {
      key: "requerimiento-tecnico",
      ambito: "proyecto",
      texto: crudas.desarrolloCtx
        ? `=== REQUERIMIENTO TÉCNICO (canvas Desarrollo — objetos, llaves y conexiones) ===\n${crudas.desarrolloCtx}`
        : "",
    },
    ...delContexto,
  ];
}

export interface InsumosDelDetalle {
  /** Bloque de `bloqueDeInstruccionesDeDoc` — "" sin brief (el golden por construcción). */
  instrucciones: string;
  encabezado: EncabezadoDelDetalle;
  fuentes: FuenteDeContexto[];
  clasificacion: ClasificacionDelDetalle;
  /** Si viene, la corrida se acota a esa fase (regen quirúrgica de X del cronograma). */
  regenerarFaseId?: string | null;
}

/**
 * EL TEMPLATE. Byte-idéntico al que vivía inline en analyze — el golden lo afirma.
 * Las instrucciones del CSE van PRIMERO (regla dura antes que el material), después el
 * encabezado del proyecto, después las fuentes en su orden, después las reglas derivadas.
 */
export function renderDetalleDeCronograma(i: InsumosDelDetalle): string {
  const porKey = new Map(i.fuentes.map((f) => [f.key, f.texto]));
  const cronograma = porKey.get("cronograma-actual") ?? "";
  const handoff = porKey.get("handoff-curado") ?? "";
  const requerimiento = porKey.get("requerimiento-tecnico") ?? "";
  /* Las fuentes del «Contexto del cronograma». Van DESPUÉS del requerimiento: primero lo que se
     prometió (handoff) y lo técnico, después lo que efectivamente pasó en el proyecto. El
     calendario va primero de las tres: las reuniones citan sus semanas. Vacías no suman ni un
     carácter — ese es el golden. */
  const delContexto = ["calendario-del-cronograma", ...FUENTES_DE_MATERIAL]
    .map((k) => porKey.get(k) ?? "")
    .filter((t) => t.trim())
    .map((t) => `\n${t}\n`)
    .join("");
  const hayMaterial = FUENTES_DE_MATERIAL.some((k) => (porKey.get(k) ?? "").trim());
  const e = i.encabezado;

  let msg = `${i.instrucciones}Empresa: ${e.companyName}
Industria: ${e.industry ?? "No especificada"}
${e.serviceTypeLabel ? `Tipo de servicio contratado: ${e.serviceTypeLabel}\n` : ""}${e.classificationLabel ? `Clasificación del proyecto: ${e.classificationLabel}\n` : ""}
${cronograma}

${handoff}
${requerimiento ? `\n${requerimiento}\n` : ""}${delContexto}
=== REGLAS SEGÚN LA CLASIFICACIÓN ===
${reglasDeClasificacion(i.clasificacion)}

Detalla el cronograma siguiendo tus instrucciones: asigna un activityType a cada fase y propón las tareas por semana (weekIndex relativo a la fase, < durationWeeks). Usa los ids EXACTOS del input.`;

  /* Con instrucciones del CSE puede haber fases YA resueltas en la vida real, fuera del orden
     que supuso el plan. Sin esto el agente les re-proponía sus tareas estándar: visto en Wherex
     — las instrucciones decían "Service prácticamente finalizado, no requirió capacitaciones" y
     la corrida devolvió igual las 9 tareas de siempre para esa fase. `tasks: []` es el "no la
     toques" que el modal ya sabe leer: preserva las tareas actuales enteras (el reparto vive en
     lib/timeline/regen-columnas.ts, donde `sin propuesta` NUNCA descarta nada).
     Solo se emite con brief o con material — sin ninguno de los dos el bloque sería ruido. Con
     material va la variante que nombra también las reuniones y las notas; sin material, el texto
     de siempre (golden «con brief»). */
  if (hayMaterial) {
    msg += FASES_RESUELTAS_CON_MATERIAL;
  } else if (i.instrucciones) {
    msg += FASES_RESUELTAS_POR_INSTRUCCIONES;
  }

  // Regen por fase: acotá la salida a la fase target (las demás van con tasks:[]) — baja el
  // costo/latencia y el riesgo de truncación. La persistencia igual filtra por onlyPhaseId.
  if (i.regenerarFaseId) {
    msg += `\n\n=== ALCANCE: REGENERAR UNA SOLA FASE ===\nDetalla ÚNICAMENTE las tareas de la fase id="${i.regenerarFaseId}". Para TODAS las demás fases del input, inclúyelas en el JSON con su id EXACTO pero con "tasks": [] — no las toques. Concentra todo el detalle en la fase indicada.`;
    /* ⛔ La regla de las fases resueltas NO vale para la fase que el CSE pidió regenerar (revisión
       adversarial, 2026-09-24). Con material o instrucciones va siempre la válvula de arriba, y si una
       reunión daba por cerrada ESTA fase, el modelo recibía dos órdenes contrarias: devolvía
       `tasks: []` y el CSE pagaba una corrida para ver «Sin tareas». Pedirla es lo más reciente que
       dijo el CSE, y lo que pide el CSE manda. */
    if (hayMaterial || i.instrucciones) msg += EXCEPCION_DE_LA_FASE_A_REGENERAR;
  }
  return msg;
}
