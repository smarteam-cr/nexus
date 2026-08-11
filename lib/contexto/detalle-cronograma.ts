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
 *
 * ── POR QUÉ LAS FUENTES LLEVAN EL RÓTULO ADENTRO ─────────────────────────────
 * La lección de la Tanda H (el deal del vecino, el spread pisado): la procedencia que viaja
 * FUERA del texto se pierde por descuido de un call site. Acá cada FuenteDeContexto nace con
 * su `=== RÓTULO ===` pegado al contenido — no existe el estado "texto sin etiqueta".
 */
import type { FuenteDeContexto } from "./tipos";

/* El fallback cuando no hay handoff confirmado — misma string que tenía la ruta. */
const SIN_HANDOFF_CONFIRMADO =
  '(Sin handoff confirmado. Generá las tareas típicas del tipo de cada fase y marcá CADA una con "porValidar": true. Títulos limpios, sin marcadores.)';

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

/** Deriva la clasificación desde los tags YA sanitizados + la modalidad del proyecto. */
export function clasificacionDeTags(
  tagSlugs: readonly string[],
  implementationType: string | null,
): ClasificacionDelDetalle {
  return {
    esReimplementacion: implementationType === "REIMPLEMENTATION",
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
    ? `- BASE DE DATOS (#6): es una RE-IMPLEMENTACIÓN sobre un HubSpot que el cliente YA usa, SIN migración desde otro CRM. NO incluyas una tarea de "cargar/crear la base de datos"; en su lugar, en la primera fase, incluí una tarea de REVISIÓN DE ESTRUCTURA Y LIMPIEZA de la base existente (propiedades, duplicados, datos sucios).`
    : `- BASE DE DATOS (#6): ${c.esReimplementacion ? "es una re-implementación pero CON migración desde otro CRM" : "es una implementación desde cero"}, así que SÍ incluí en la primera fase una tarea de CARGAR/ESTRUCTURAR LA BASE DE DATOS (importar y modelar los datos en HubSpot).`;
  const techRule = c.llevaDesarrollo
    ? `\n- DESARROLLO/INTEGRACIÓN (#7): el proyecto lleva desarrollo a medida o Insider One. Las tareas técnicas (integraciones, desarrollo, APIs) marcalas con responsable "DEV" y, si existe una fase de "Desarrollo / Integración", ubicalas SOLO ahí (no las mezcles con las tareas funcionales de otras fases).`
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
}): FuenteDeContexto[] {
  return [
    {
      key: "cronograma-actual",
      ambito: "proyecto",
      texto: `=== CRONOGRAMA A DETALLAR (fases EXISTENTES — no cambies nombres, duraciones ni orden) ===\n${crudas.timelineCtx}`,
    },
    {
      key: "handoff-curado",
      ambito: "proyecto",
      texto: `=== HANDOFF CURADO (bloques confirmados por el CSE) ===\n${crudas.handoffCtx || SIN_HANDOFF_CONFIRMADO}`,
    },
    {
      key: "requerimiento-tecnico",
      ambito: "proyecto",
      texto: crudas.desarrolloCtx
        ? `=== REQUERIMIENTO TÉCNICO (canvas Desarrollo — objetos, llaves y conexiones) ===\n${crudas.desarrolloCtx}`
        : "",
    },
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
  const e = i.encabezado;

  let msg = `${i.instrucciones}Empresa: ${e.companyName}
Industria: ${e.industry ?? "No especificada"}
${e.serviceTypeLabel ? `Tipo de servicio contratado: ${e.serviceTypeLabel}\n` : ""}${e.classificationLabel ? `Clasificación del proyecto: ${e.classificationLabel}\n` : ""}
${cronograma}

${handoff}
${requerimiento ? `\n${requerimiento}\n` : ""}
=== REGLAS SEGÚN LA CLASIFICACIÓN ===
${reglasDeClasificacion(i.clasificacion)}

Detallá el cronograma siguiendo tus instrucciones: asigná un activityType a cada fase y proponé las tareas por semana (weekIndex relativo a la fase, < durationWeeks). Usá los ids EXACTOS del input.`;

  /* Con instrucciones del CSE puede haber fases YA resueltas en la vida real, fuera del orden
     que supuso el plan. Sin esto el agente les re-proponía sus tareas estándar: visto en Wherex
     — las instrucciones decían "Service prácticamente finalizado, no requirió capacitaciones" y
     la corrida devolvió igual las 9 tareas de siempre para esa fase. `tasks: []` es el "no la
     toques" que el modal ya sabe leer: preserva las tareas actuales enteras (el reparto vive en
     lib/timeline/regen-columnas.ts, donde `sin propuesta` NUNCA descarta nada).
     Solo se emite con brief presente — sin instrucciones el bloque sería ruido. */
  if (i.instrucciones) {
    msg += `\n\n=== FASES QUE LAS INSTRUCCIONES DAN POR RESUELTAS ===\nSi las instrucciones del CSE de arriba dicen que una fase concreta ya está terminada, resuelta o que no requirió trabajo, NO le propongas tareas: incluila en el JSON con su id EXACTO y "tasks": [] — se deja como está. Vale AUNQUE esa fase venga tarde en el orden del cronograma: el orden es la expectativa inicial del plan, no el orden real en que se hizo el trabajo. Concentrá el detalle en las fases donde todavía hay trabajo por delante.`;
  }

  // Regen por fase: acotá la salida a la fase target (las demás van con tasks:[]) — baja el
  // costo/latencia y el riesgo de truncación. La persistencia igual filtra por onlyPhaseId.
  if (i.regenerarFaseId) {
    msg += `\n\n=== ALCANCE: REGENERAR UNA SOLA FASE ===\nDetallá ÚNICAMENTE las tareas de la fase id="${i.regenerarFaseId}". Para TODAS las demás fases del input, incluilas en el JSON con su id EXACTO pero con "tasks": [] — no las toques. Concentrá todo el detalle en la fase indicada.`;
  }
  return msg;
}
