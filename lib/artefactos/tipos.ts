/**
 * lib/artefactos/tipos.ts — LOS TIPOS DE ARTEFACTO Y LO QUE ADMITE CADA UNO (etapa V2 de docs/artefactos-plan.md). PURO:
 * lo importan la pantalla, el servidor y las pruebas. Sin defs del motor (pesan): el catálogo de secciones de cada tipo lo
 * arma `./catalogo.ts`, que sí las importa y no se carga en la pantalla.
 *
 * Un TIPO es qué clase de documento es (planificación, diagnóstico, plan de adopción…). Una COPIA es una fila de
 * `ProjectCanvas`: la de siempre de cada tipo conserva su `slug` (lo buscan 105 lugares, así que nada de lo que hoy busca
 * «el diagnóstico del proyecto» cambia de respuesta) y las demás nacen con `slug = NULL` y `tipoArtefacto` = el id del
 * tipo. Elías, 29 oct: no hay una copia «oficial»; los lectores (la entrega, la escala, los agentes) leen TODAS, con su
 * nombre y su estado (`./copias.ts`, `./copias-server.ts`).
 *
 * El id de un tipo que ya era pieza es el slug de su pieza (lib/pieces/registry.ts): «planning», «diagnosis». Los tipos
 * nuevos estrenan el suyo, en inglés y estable como un slug: «adoption-plan», «roadmap». Cambiar un id rompe las copias
 * que ya existen; cambiar el nombre visible no rompe nada.
 *
 * Agregar un tipo, quitar uno o cambiar lo que admite es decisión de producto: `tipos.test.ts` congela el set.
 */
import { CLAVE_DE_LA_PLANTILLA, entregableDe, type PlantillaDeEntregable } from "@/lib/entregables/registro";

/** De quién puede ser un documento de este tipo. */
export type DuenoDelArtefacto = "proyecto" | "empresa";

/** Las celdas de permisos con que se genera (lib/auth/permissions/registry.ts). */
export type SeccionDePermisoDelTipo = "kickoff" | "diagnostico" | "planificacion" | "exploracion" | "desarrollo" | "entrega" | "implementacion" | "cronograma" | "handoff";

export interface TipoDeArtefacto {
  /** IDENTIDAD estable: es lo que queda en `tipoArtefacto` de cada copia (o el `slug` de la de siempre). */
  id: string;
  /** Cómo se llama en pantalla. */
  nombre: string;
  /** «una planificación», «un diagnóstico»: para «Crear otra…» y los avisos. */
  conArticulo: string;
  /** Para qué sirve, en una frase (lo leen la pantalla, el chat y el armador de V5). */
  paraQue: string;
  /**
   * «varias» = un proyecto puede tener las que quiera, cada una con su nombre (Elías, 30 oct: todo menos el Resumen).
   * «una» = el storage o el flujo la hacen única (el cronograma es `ProjectTimeline.projectId @unique`; el handoff es el
   * paso Ventas → CS y vive en el Resumen).
   */
  copias: "varias" | "una";
  /** De quién puede ser. Elías, 29 oct: el diagnóstico, la exploración y la hoja de ruta, también de la empresa. */
  duenos: readonly DuenoDelArtefacto[];
  /** Lo lee el cliente (se comparte con su enlace). Uno interno no ofrece compartir. */
  clientFacing: boolean;
  /** Dónde vive su contenido: en un canvas del motor (`ProjectCanvas`) o en sus propias tablas. */
  vive: "canvas" | "propio";
  /** Un tipo que ya era pieza: su slug. Los nuevos no tienen pieza (no tienen fila en el flujo del riel). */
  pieza: string | null;
  /** El grupo del riel donde se listan sus copias. */
  clase: "entregable" | "herramienta";
  /** La celda con que se genera y se regenera. */
  permiso: SeccionDePermisoDelTipo;
  /**
   * Con qué reglas lee su contexto al generar (lib/contexto/documento.ts): un tipo nuevo, las del documento más parecido. Lo
   * elegido (reuniones, notas e instrucciones) es de cada copia (lib/artefactos/contexto-de-la-copia.ts).
   */
  contextoDe: "diagnosis" | "planning" | "kickoff" | "exploration" | "tech-requirements" | "delivery" | null;
  /**
   * Lo que se escribe no vive en el canvas: la exploración (`ExploracionDeVenta`) y los cuestionarios (`Cuestionario`), cada
   * copia con su `canvasId`. Duplicar copiaría un canvas vacío, así que cada copia nace en blanco.
   */
  sinDuplicar?: boolean;
  /** La copia sí se comparte por enlace, el documento de siempre no: la entrega guarda en su Json lo que el cliente no ve. */
  sinEnlaceElDeSiempre?: boolean;
  /**
   * Sus plantillas propias. Sin esto, las de su entregable (lib/entregables/registro.ts). Las que suman a un entregable van
   * acá y no en el registro a propósito: son de las copias, y el selector del documento de siempre no cambia.
   */
  plantillas?: readonly PlantillaDeEntregable[];
  /** Las keys estructurales: la portada (la primera) y el cierre (la última). Van en toda plantilla. */
  estructurales: readonly [string, string] | readonly [];
}

/** La HOJA DE RUTA (catálogo n.º 16 y n.º 3): tipo nuevo, con el backlog y las decisiones (Elías, 30 oct). */
export const TIPO_HOJA_DE_RUTA = "roadmap";
export const SECCIONES_DE_LA_HOJA_DE_RUTA_ESENCIAL = ["hoja_de_ruta", "frentes", "horizonte", "diferido", "cierre"] as const;

/** El informe de avance de la Entrega (catálogo n.º 15). Sus secciones nuevas viven en plantillas-adicionales.defs.ts. */
export const SECCIONES_DEL_INFORME_DE_AVANCE = ["portada", "resumen", "avance_por_frente", "logros_del_periodo", "riesgos_y_pendientes_del_cliente", "recomendaciones", "cierre"] as const;

/** El aprendizaje de un servicio recurrente (Elías, 31 oct): una plantilla más de la Entrega. Sus secciones viven en plantillas-adicionales.defs.ts. */
export const SECCIONES_DEL_APRENDIZAJE = ["portada", "resumen", "resultados_medidos", "lo_que_aprendimos", "recomendaciones", "cierre"] as const;

/** Las plantillas que se suman a la Planificación. Las listas viven acá: el template las lee (plantillas-adicionales.defs.ts). */
export const SECCIONES_DE_LA_CAMPANA = ["planificacion", "campana_objetivo", "campana_segmentos", "campana_piezas", "campana_presupuesto", "formularios", "automatizaciones", "campana_resultado", "cierre"] as const;
export const SECCIONES_DEL_MARKETING = ["planificacion", "definicion_procesos", "ciclo_vida_crm", "canales_entrada", "formularios", "automatizaciones", "informes", "cierre"] as const;
export const SECCIONES_DE_WHATSAPP = ["planificacion", "agente_objetivo", "agente_identidad", "agente_conocimiento", "conversaciones", "agente_derivacion", "whatsapp_plantillas", "agente_fases", "cierre"] as const;

/** Los CUESTIONARIOS: la pieza no vive en un canvas; cada copia sí, y sus cuestionarios cuelgan de él (`Cuestionario.canvasId`). */
export const TIPO_CUESTIONARIOS = "questionnaires";

/* ── Los tipos nuevos (etapa V6, adelantada: Elías, 29 oct) ────────────────────────────────────────────────────── */

/** El PLAN DE ADOPCIÓN (catálogo n.º 10, 11 cuentas): que lo entregado se use. Fija hábitos y los mide; no enseña. */
export const TIPO_PLAN_DE_ADOPCION = "adoption-plan";
export const SECCIONES_DEL_PLAN_DE_ADOPCION_COMERCIAL = [
  "adopcion",
  "comportamientos",
  "reglas",
  "rutinas_adopcion",
  "medicion",
  "altas_bajas",
  "cierre",
] as const;
export const SECCIONES_DEL_PLAN_DE_ADOPCION_POR_NIVELES = [
  "adopcion",
  "niveles",
  "comportamientos",
  "plan_despliegue",
  "comunicacion",
  "medicion",
  "cierre",
] as const;
export const SECCIONES_DEL_PLAN_DE_ADOPCION_TECNICO = ["adopcion", "administradores", "altas_bajas", "reglas", "medicion", "cierre"] as const;

/** Con la capacitación adentro (catálogo n.º 1): el plan de adopción la absorbe (Elías, 30 oct). */
export const SECCIONES_DEL_PLAN_DE_ADOPCION_CAPACITACION = [
  "adopcion",
  "introduccion",
  "estructura_equipo",
  "plan_por_equipo",
  "entrenamientos",
  "pilotos",
  "medicion",
  "cierre",
] as const;

/**
 * El REQUERIMIENTO TÉCNICO (catálogo n.º 6, 15 cuentas): junta «Integraciones» y lo que fue «Integración técnica» en un solo
 * tipo (Elías, 30 oct). El documento de siempre no cambia; las copias eligen plantilla. El guion de pruebas y la migración
 * de datos son secciones suyas, y el mapa de procesos llega en la arquitectura.
 */
export const TIPO_REQUERIMIENTO_TECNICO = "tech-requirements";
export const SECCIONES_DEL_REQUERIMIENTO_DE_SIEMPRE = [
  "requerimiento",
  "retos_cliente",
  "criterios_exito",
  "arquitectura",
  "relacion_objetos",
  "propiedades",
  "comunicacion",
  "cierre",
] as const;
export const SECCIONES_DEL_MAPA_DE_INTEGRACION = [
  "requerimiento",
  "alcance_firmado",
  "arquitectura",
  "identificador_unico",
  "mapa_integracion",
  "comunicacion",
  "entregables_de_terceros",
  "criterios_exito",
  "cierre",
] as const;

export const TIPOS: readonly TipoDeArtefacto[] = [
  {
    id: "exploration",
    nombre: "Exploración",
    conArticulo: "una exploración",
    paraQue: "La misma de la preventa, con las preguntas de Customer Success, y adentro agregas las sesiones. Una por frente o por área, cada una con su nombre. Interna.",
    copias: "varias",
    sinDuplicar: true,
    duenos: ["proyecto", "empresa"],
    clientFacing: false,
    vive: "canvas",
    pieza: "exploration",
    clase: "herramienta",
    permiso: "exploracion",
    contextoDe: "exploration",
    plantillas: [
      {
        id: "exploracion",
        nombre: "Exploración",
        paraQue: "Lo que hay que entender, lo que ya sabemos, lo que damos por supuesto, el plan de sesiones y a quién involucrar.",
      },
    ],
    estructurales: ["exploracion", "cierre"],
  },
  {
    id: TIPO_CUESTIONARIOS,
    nombre: "Cuestionarios",
    conArticulo: "unos cuestionarios",
    paraQue: "Lo que contesta el cliente: el táctico, el de la escala y el de estrategia, con un enlace por persona. Una tanda por frente o por momento, cada una con su nombre.",
    copias: "varias",
    sinDuplicar: true,
    duenos: ["proyecto"],
    clientFacing: false,
    vive: "canvas",
    pieza: TIPO_CUESTIONARIOS,
    clase: "herramienta",
    permiso: "exploracion",
    contextoDe: null,
    plantillas: [{ id: "cuestionarios", nombre: "Cuestionarios", paraQue: "Adentro eliges a quién le preguntas y qué cuestionario le mandas." }],
    estructurales: [],
  },
  {
    id: "diagnosis",
    nombre: "Diagnóstico",
    conArticulo: "un diagnóstico",
    paraQue: "Por qué el cliente tiene los resultados que tiene y qué vamos a hacer. Uno por área, de uso o para presentar.",
    copias: "varias",
    duenos: ["proyecto", "empresa"],
    clientFacing: true,
    vive: "canvas",
    pieza: "diagnosis",
    clase: "entregable",
    permiso: "diagnostico",
    contextoDe: "diagnosis",
    estructurales: ["diagnostico", "cierre"],
  },
  {
    id: "kickoff",
    nombre: "Kickoff",
    conArticulo: "un kickoff",
    paraQue: "La presentación de arranque: el alcance, el equipo, cómo se trabaja y lo que sigue. Otro kickoff sirve cuando cambia un acuerdo o hay una desalineación.",
    copias: "varias",
    duenos: ["proyecto"],
    clientFacing: true,
    vive: "canvas",
    pieza: "kickoff",
    clase: "entregable",
    permiso: "kickoff",
    contextoDe: "kickoff",
    estructurales: ["bienvenida", "cierre"],
  },
  {
    id: "planning",
    nombre: "Planificación",
    conArticulo: "una planificación",
    paraQue: "Lo que va a quedar configurado: HubSpot completo, lo esencial, una campaña, el marketing o WhatsApp y su agente. Una por frente, cada una con su nombre.",
    copias: "varias",
    duenos: ["proyecto"],
    clientFacing: true,
    vive: "canvas",
    pieza: "planning",
    clase: "entregable",
    permiso: "planificacion",
    contextoDe: "planning",
    plantillas: [
      ...(entregableDe("planning")?.plantillas ?? []),
      {
        id: "planificacion-campana",
        nombre: "Campaña de marketing",
        paraQue: "Una campaña: su objetivo, a quién le llega y a quién no, las piezas y los canales, el presupuesto y el resultado contra la meta.",
        secciones: SECCIONES_DE_LA_CAMPANA,
        ordenPropio: true,
      },
      {
        id: "planificacion-marketing",
        nombre: "Cómo debería funcionar el marketing",
        paraQue: "El marketing de punta a punta: el proceso, el ciclo de vida, por dónde entran los contactos, los formularios, las automatizaciones y los informes.",
        secciones: SECCIONES_DEL_MARKETING,
      },
      {
        id: "planificacion-whatsapp",
        nombre: "WhatsApp y agente",
        paraQue: "Qué atiende el agente, cómo habla, de dónde responde, cuándo pasa a una persona, las plantillas de mensajes, las fases y los créditos.",
        secciones: SECCIONES_DE_WHATSAPP,
        ordenPropio: true,
      },
    ],
    estructurales: ["planificacion", "cierre"],
  },
  {
    id: TIPO_REQUERIMIENTO_TECNICO,
    nombre: "Requerimiento técnico",
    conArticulo: "un requerimiento técnico",
    paraQue:
      "El trabajo técnico que se firma: la arquitectura, el mapa de integración con otro sistema, el identificador único, las pruebas, la migración de datos y lo que debe entregar el cliente o un tercero.",
    copias: "varias",
    duenos: ["proyecto"],
    clientFacing: true,
    vive: "canvas",
    pieza: "tech-requirements",
    clase: "entregable",
    permiso: "desarrollo",
    contextoDe: "tech-requirements",
    plantillas: [
      {
        id: "integraciones",
        nombre: "Integraciones",
        paraQue: "El requerimiento de siempre: arquitectura, objetos, propiedades y cómo se comunican.",
        secciones: SECCIONES_DEL_REQUERIMIENTO_DE_SIEMPRE,
      },
      {
        id: "integracion-mapa",
        nombre: "Mapa de integración",
        paraQue: "Lo que hay que firmar antes de construir: el alcance, la arquitectura, el identificador único, el mapa de campos, cuándo se sincroniza y lo que falta que entreguen.",
        secciones: SECCIONES_DEL_MAPA_DE_INTEGRACION,
        recomendada: true,
      },
      {
        id: "integracion-completa",
        nombre: "Integración completa",
        paraQue: "Además del mapa: qué duele hoy, la relación entre objetos, el diccionario de propiedades, el guion de pruebas y la migración de datos.",
      },
    ],
    estructurales: ["requerimiento", "cierre"],
  },
  {
    id: TIPO_PLAN_DE_ADOPCION,
    nombre: "Plan de adopción",
    conArticulo: "un plan de adopción",
    paraQue: "Que lo entregado se use: qué se espera de cada rol, cómo se capacita cada equipo, los pilotos, qué no se negocia y cómo se mide.",
    copias: "varias",
    duenos: ["proyecto"],
    clientFacing: true,
    vive: "canvas",
    pieza: null,
    clase: "entregable",
    permiso: "planificacion",
    contextoDe: "planning",
    plantillas: [
      {
        id: "adopcion-equipo-comercial",
        nombre: "Equipo comercial",
        paraQue: "Para el equipo de ventas que va a usar HubSpot: lo que se registra siempre, la calidad del dato y la rutina de la gerencia.",
        secciones: SECCIONES_DEL_PLAN_DE_ADOPCION_COMERCIAL,
        recomendada: true,
      },
      {
        id: "adopcion-por-niveles",
        nombre: "Organización por niveles",
        paraQue: "Para una organización con dirección, líderes y representantes, o por zonas: quién entra primero, cómo se le cuenta y cómo se mide.",
        secciones: SECCIONES_DEL_PLAN_DE_ADOPCION_POR_NIVELES,
      },
      {
        id: "adopcion-tecnica",
        nombre: "Componente técnico",
        paraQue: "Para cuando los administradores del cliente quedan a cargo del portal: el traspaso, las altas y bajas y lo que no se toca.",
        secciones: SECCIONES_DEL_PLAN_DE_ADOPCION_TECNICO,
      },
      {
        id: "adopcion-capacitacion",
        nombre: "Capacitación y pilotos",
        paraQue: "La versión detallada: la introducción, la estructura del equipo, el plan por equipo, los entrenamientos, los pilotos y cómo se mide.",
        secciones: SECCIONES_DEL_PLAN_DE_ADOPCION_CAPACITACION,
      },
    ],
    estructurales: ["adopcion", "cierre"],
  },
  {
    id: TIPO_HOJA_DE_RUTA,
    nombre: "Hoja de ruta",
    conArticulo: "una hoja de ruta",
    paraQue: "Qué se va a hacer los próximos meses y en qué orden, el backlog, lo que quedó para después y las decisiones tomadas.",
    copias: "varias",
    duenos: ["proyecto", "empresa"],
    clientFacing: true,
    vive: "canvas",
    pieza: null,
    clase: "entregable",
    permiso: "planificacion",
    contextoDe: "planning",
    plantillas: [
      {
        id: "hoja-de-ruta-esencial",
        nombre: "Hoja de ruta esencial",
        paraQue: "Para avanzar rápido: los frentes activos, lo que viene y lo que quedó para después.",
        secciones: SECCIONES_DE_LA_HOJA_DE_RUTA_ESENCIAL,
        recomendada: true,
      },
      {
        id: "hoja-de-ruta-completa",
        nombre: "Con backlog y decisiones",
        paraQue: "Además: el backlog priorizado, el registro de decisiones y la bolsa de horas.",
      },
    ],
    estructurales: ["hoja_de_ruta", "cierre"],
  },
  {
    id: "delivery",
    nombre: "Entrega",
    conArticulo: "una entrega",
    paraQue: "El cierre del proyecto. Mientras sigue abierto, un informe de avance para el cliente.",
    copias: "varias",
    duenos: ["proyecto"],
    clientFacing: true,
    vive: "canvas",
    pieza: "delivery",
    clase: "entregable",
    permiso: "entrega",
    contextoDe: "delivery",
    sinEnlaceElDeSiempre: true,
    /* Sin la plantilla «Entrega»: cumplimiento, escala y pendientes los calcula su runner, y una copia quedaría sin ellas.
       El documento de siempre sigue con su botón y su plantilla. */
    plantillas: [
      {
        id: "informe-de-avance",
        nombre: "Informe de avance",
        paraQue: "El informe periódico al cliente: lo avanzado por frente, lo logrado, los riesgos, lo que falta de su lado y lo que viene.",
        secciones: SECCIONES_DEL_INFORME_DE_AVANCE,
        ordenPropio: true,
      },
      {
        id: "aprendizaje",
        nombre: "Aprendizaje",
        paraQue: "Lo que se midió, lo que aprendimos juntos y qué conviene hacer ahora, con el contexto del proyecto y sus reuniones.",
        secciones: SECCIONES_DEL_APRENDIZAJE,
        ordenPropio: true,
      },
    ],
    estructurales: ["portada", "cierre"],
  },
  // ── Los que se quedan en uno (el storage o el flujo los hacen únicos) ───────────────────────────────────────────
  {
    id: "implementation",
    nombre: "Ejecución",
    conArticulo: "una ejecución",
    paraQue: "La guía de construcción del CSE. Una por frente, cada una con su nombre. Interna.",
    copias: "varias",
    duenos: ["proyecto"],
    clientFacing: false,
    vive: "canvas",
    pieza: "implementation",
    clase: "herramienta",
    permiso: "implementacion",
    contextoDe: "planning",
    plantillas: [{ id: "ejecucion", nombre: "Ejecución", paraQue: "Qué se construye, en qué orden y cómo se verifica." }],
    estructurales: ["implementacion", "cierre"],
  },
  {
    id: "timeline",
    nombre: "Cronograma",
    conArticulo: "un cronograma",
    paraQue: "Las fases y las tareas del proyecto. Uno por proyecto: lo leen Tareas y Cobranza.",
    copias: "una",
    duenos: ["proyecto"],
    clientFacing: true,
    vive: "propio",
    pieza: "timeline",
    clase: "herramienta",
    permiso: "cronograma",
    contextoDe: null,
    estructurales: [],
  },
  {
    id: "handoff",
    nombre: "Handoff",
    conArticulo: "un handoff",
    paraQue: "El paso de Ventas a Customer Success: lo vendido y su contexto.",
    copias: "una",
    duenos: ["proyecto"],
    clientFacing: false,
    vive: "canvas",
    pieza: "handoff",
    clase: "herramienta",
    permiso: "handoff",
    contextoDe: null,
    estructurales: [],
  },
];

const POR_ID = new Map(TIPOS.map((t) => [t.id, t]));

export function tipoDeArtefacto(id: string | null | undefined): TipoDeArtefacto | null {
  return id ? (POR_ID.get(id) ?? null) : null;
}

/** ¿Un proyecto puede tener otra copia de este tipo? */
export function admiteCopias(id: string | null | undefined): boolean {
  const t = tipoDeArtefacto(id);
  return !!t && t.copias === "varias" && t.vive === "canvas" && t.duenos.includes("proyecto");
}

/** «Crear otra planificación», «Crear otro kickoff», «Crear otros cuestionarios». */
export function rotuloDeCrearOtro(t: TipoDeArtefacto): string {
  const otro = t.conArticulo.startsWith("unos") ? "otros" : t.conArticulo.startsWith("una") ? "otra" : "otro";
  return `Crear ${otro} ${t.nombre.toLowerCase()}`;
}

/** ¿Se le cambia el nombre? Todo lo que admite copias y el cronograma, que es uno solo pero también se llama como quieran. */
export function seRenombra(id: string | null | undefined): boolean {
  return admiteCopias(id) || id === "timeline";
}

/** Los tipos con que se crea un documento en un proyecto, en el orden en que se ofrecen. */
export function tiposCreablesEnElProyecto(clase?: TipoDeArtefacto["clase"]): TipoDeArtefacto[] {
  return TIPOS.filter((t) => admiteCopias(t.id) && (!clase || t.clase === clase));
}

/** Las plantillas de un tipo: las suyas, o las de su entregable. La primera es la de siempre. */
export function plantillasDelTipo(id: string): readonly PlantillaDeEntregable[] {
  const t = tipoDeArtefacto(id);
  if (!t) return [];
  if (t.plantillas) return t.plantillas;
  return entregableDe(id)?.plantillas ?? [];
}

/**
 * La plantilla con que se armó un documento, leída de su entry `__plantilla`, para CUALQUIER tipo (`plantillaDelDocumento`
 * de lib/entregables/registro.ts solo conoce los entregables, no el plan de adopción ni la integración técnica). Sin
 * anotar, la de siempre (la primera): así se lee un documento de antes de las plantillas.
 */
export function plantillaGuardadaDelTipo(id: string, sections: unknown): { plantilla: PlantillaDeEntregable | null; guardada: boolean } {
  const e = (Array.isArray(sections) ? sections : []).find(
    (x): x is { plantilla?: unknown } => !!x && typeof x === "object" && (x as { key?: unknown }).key === CLAVE_DE_LA_PLANTILLA,
  );
  const guardada = typeof e?.plantilla === "string" ? plantillaDelTipo(id, e.plantilla) : null;
  return guardada ? { plantilla: guardada, guardada: true } : { plantilla: plantillasDelTipo(id)[0] ?? null, guardada: false };
}

/** Una plantilla de un tipo. Sin id, la recomendada o la de siempre. Un id ajeno es null (quien llama lo rechaza). */
export function plantillaDelTipo(id: string, plantillaId?: string | null): PlantillaDeEntregable | null {
  const ps = plantillasDelTipo(id);
  if (!plantillaId) return ps.find((p) => p.recomendada) ?? ps[0] ?? null;
  return ps.find((p) => p.id === plantillaId) ?? null;
}
