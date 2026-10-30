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
 * nuevos estrenan el suyo, en inglés y estable como un slug: «adoption-plan», «integration». Cambiar un id rompe las copias
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
   * «varias» = un proyecto puede tener las que quiera, cada una con su nombre (Elías, 29 oct: kickoff y exploración
   * incluidos). «una» = el storage o el flujo la hacen única (el cronograma es `ProjectTimeline.projectId @unique`; el
   * handoff es el paso Ventas → CS; la escala es una por empresa).
   */
  copias: "varias" | "una";
  /** De quién puede ser. Elías, 29 oct: el diagnóstico, la escala, la exploración y la hoja de ruta, también de la empresa. */
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
   * El «Contexto adicional» del que lee al generar (lib/contexto/documento.ts): las reuniones elegidas y las notas son POR
   * TIPO hasta que lleguen las de cada copia (siguiente tanda), así que un tipo nuevo lee las del documento más parecido.
   */
  contextoDe: "diagnosis" | "planning" | "kickoff" | "exploration" | "tech-requirements" | "delivery" | null;
  /** Sus plantillas propias. Los tipos que ya eran entregables las toman de lib/entregables/registro.ts. */
  plantillas?: readonly PlantillaDeEntregable[];
  /** Las keys estructurales: la portada (la primera) y el cierre (la última). Van en toda plantilla. */
  estructurales: readonly [string, string] | readonly [];
}

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

/**
 * La INTEGRACIÓN TÉCNICA (catálogo n.º 6, 15 cuentas; Cemaco quiere integrar su ERP), con su MAPA DE INTEGRACIÓN: qué
 * objetos y campos de cada sistema pasan a HubSpot, en qué sentido, con qué transformación y cada cuánto. Presta las
 * secciones del requerimiento técnico (el tipo `tech-requirements`, «Integraciones») y suma las cuatro que le faltaban.
 */
export const TIPO_INTEGRACION_TECNICA = "integration";
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
    id: "planning",
    nombre: "Planificación",
    conArticulo: "una planificación",
    paraQue: "Lo que va a quedar configurado en HubSpot. Una por frente (Marketing, WhatsApp, Servicio…), cada una con su nombre.",
    copias: "varias",
    duenos: ["proyecto"],
    clientFacing: true,
    vive: "canvas",
    pieza: "planning",
    clase: "entregable",
    permiso: "planificacion",
    contextoDe: "planning",
    estructurales: ["planificacion", "cierre"],
  },
  {
    id: "exploration",
    nombre: "Exploración",
    conArticulo: "una exploración",
    paraQue: "Qué hay que entender del negocio antes de proponer: lo que ya sabemos, lo que suponemos y a quién preguntarle. Interna.",
    copias: "varias",
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
    id: TIPO_PLAN_DE_ADOPCION,
    nombre: "Plan de adopción",
    conArticulo: "un plan de adopción",
    paraQue: "Que lo entregado se use: qué se espera de cada rol, qué no se negocia, cómo se mide y cómo se suma el equipo.",
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
    ],
    estructurales: ["adopcion", "cierre"],
  },
  {
    id: TIPO_INTEGRACION_TECNICA,
    nombre: "Integración técnica",
    conArticulo: "una integración técnica",
    paraQue:
      "El mapa de integración con otro sistema (un ERP, un sistema de operación): qué objetos y campos pasan a HubSpot, en qué sentido, con qué transformación y cada cuánto, el identificador único, el alcance firmado y lo que debe entregar el cliente o un tercero.",
    copias: "varias",
    duenos: ["proyecto"],
    clientFacing: true,
    vive: "canvas",
    pieza: null,
    clase: "entregable",
    permiso: "desarrollo",
    contextoDe: "tech-requirements",
    plantillas: [
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
        paraQue: "Además del mapa: qué duele hoy, la relación entre objetos y el diccionario de propiedades.",
      },
    ],
    estructurales: ["requerimiento", "cierre"],
  },
  // ── Los que se quedan en una copia (el storage o el flujo los hace únicos) ──────────────────────────────────────
  {
    id: "tech-requirements",
    nombre: "Integraciones",
    conArticulo: "un requerimiento técnico",
    paraQue: "El requerimiento técnico que nace del handoff cuando hay trabajo técnico. Para otra integración, una integración técnica.",
    copias: "una",
    duenos: ["proyecto"],
    clientFacing: true,
    vive: "canvas",
    pieza: "tech-requirements",
    clase: "entregable",
    permiso: "desarrollo",
    contextoDe: "tech-requirements",
    estructurales: ["requerimiento", "cierre"],
  },
  {
    id: "delivery",
    nombre: "Entrega",
    conArticulo: "una entrega",
    paraQue: "El cierre del proyecto: el desafío resuelto, los objetivos alcanzados y lo que queda funcionando.",
    copias: "una",
    duenos: ["proyecto"],
    clientFacing: true,
    vive: "canvas",
    pieza: "delivery",
    clase: "entregable",
    permiso: "entrega",
    contextoDe: "delivery",
    estructurales: ["portada", "cierre"],
  },
  {
    id: "implementation",
    nombre: "Ejecución",
    conArticulo: "una ejecución",
    paraQue: "La guía de construcción del CSE. Interna.",
    copias: "una",
    duenos: ["proyecto"],
    clientFacing: false,
    vive: "canvas",
    pieza: "implementation",
    clase: "herramienta",
    permiso: "implementacion",
    contextoDe: null,
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
  {
    id: "escala",
    nombre: "Escala de rendimiento",
    conArticulo: "una escala",
    paraQue: "Dónde está la empresa en cada dimensión. Una por empresa, la comparten la preventa y el proyecto (etapa V1).",
    copias: "una",
    duenos: ["empresa"],
    clientFacing: true,
    vive: "propio",
    pieza: null,
    clase: "herramienta",
    permiso: "diagnostico",
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

/** Los tipos con que se crea una copia en un proyecto, en el orden en que se ofrecen. */
export function tiposCreablesEnElProyecto(): TipoDeArtefacto[] {
  return TIPOS.filter((t) => admiteCopias(t.id));
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
