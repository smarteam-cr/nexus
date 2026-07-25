/**
 * components/landing/configs/implementacion.defs.ts
 *
 * Defs SERVER-SAFE del canvas "Implementación" — la GUÍA DE CONSTRUCCIÓN del CSE: qué
 * construir exactamente en el portal de HubSpot, y los prompts para que Breeze cree lo
 * que pueda. Documento INTERNO (paleta `stl-internal`).
 *
 * EL ORDEN ES LA DOCTRINA (decisión de negocio 2026-07-25): primero se decide la
 * ARQUITECTURA (propiedades, pipelines/objetos, procesos de marketing) y RECIÉN AHÍ
 * valen los prompts — pedirle a Breeze que construya sin arquitectura decidida es
 * pedirle que la invente. La sección de prompts se DERIVA de las tres anteriores: un
 * prompt que construye algo no decidido arriba, sobra.
 *
 * EL GATE DE BREEZE: el alcance real de lo que Breeze puede hacer vive en la base de
 * conocimiento (docs HUBSPOT_SPEC con tags breeze_agents/breeze_assistants). Si no hay
 * ninguno PUBLICADO, el canvas lo avisa y el agente genera igual — marcando cada prompt
 * como "sin_verificar". Avisar, nunca bloquear: la doctrina de todo el sistema.
 */
import type { BCSectionDef } from "./business-case.defs";
import type { BcTemplateDef } from "./templates.defs";
import { PROCESS_MAPPING_SCHEMA, PROCESS_MAPPING_EMPTY } from "./shared-sections.defs";
import { IMPLEMENTACION_CIERRE_DEFAULT } from "@/lib/canvas/canvas-defs";

const str = { type: "string" } as const;
const strArray = { type: "array", items: { type: "string" } } as const;
const asSchema = (s: unknown) => s as unknown as Record<string, unknown>;
function arrayOf(props: Record<string, unknown>, required: string[]) {
  return { type: "array", items: { type: "object", properties: props, required } } as const;
}

const proseSchema = {
  type: "object",
  properties: {
    intro: str,
    items: { type: "array", items: { type: "object", properties: { title: str, detail: str }, required: ["title"] } },
  },
  required: ["items"],
} as const;
const proseEmpty = { intro: "", items: [] };

export const IMPLEMENTACION_SECTION_DEFS: BCSectionDef[] = [
  {
    key: "implementacion",
    label: "Guía de construcción",
    eyebrow: "Implementación",
    theme: "dark",
    backdrop: true,
    selfTitled: true,
    pinned: true,
    noHide: true,
    sectionType: "implementacion_hero",
    agentGenerated: true,
    empty: { titulo: "", headline: "", subhead: "", tags: [] },
    agentHint: "Qué se construye primero y por qué. Tags = hubs/objetos del alcance.",
    brief:
      "`titulo`: el nombre del documento en pocas palabras (máximo 60 caracteres), del tipo 'Guía de construcción'. Es el título de la página, no un titular de venta: sin verbos de transformación, sin promesas y sin el nombre del cliente. Portada de la guía. `headline`: qué se construye PRIMERO y por qué ese orden ('Primero las propiedades de Negocio: todo lo demás las referencia'). " +
      "`subhead`: 1-2 frases con el estado de la decisión — de dónde sale esta guía (la planificación aprobada, el requerimiento técnico) y qué queda pendiente de decidir. " +
      "`tags`: los hubs/objetos que cubre ('Sales', 'Negocios', 'Tickets').",
    schema: { type: "object", properties: { titulo: str, headline: str, subhead: str, tags: strArray }, required: ["headline"] },
  },
  {
    key: "arquitectura_propiedades",
    label: "Arquitectura de propiedades",
    eyebrow: "El diccionario del portal",
    theme: "light",
    sectionType: "props_table",
    agentGenerated: true,
    empty: { intro: "", filas: [] },
    agentHint:
      "Una fila por PROPIEDAD a crear/configurar en HubSpot. `⚠️ Por validar` en el campo si el internal name no está decidido — nunca inventes nombres.",
    brief:
      "La tabla de PROPIEDADES a crear o configurar en el portal — el diccionario que el CSE consulta mientras construye. `intro`: 1 frase opcional. " +
      "`filas`: una por propiedad. Derivalas de la PLANIFICACIÓN (arquitectura de la solución) y del REQUERIMIENTO TÉCNICO — si el canvas de Desarrollo ya definió propiedades de la integración, NO las dupliques: referencialas en la descripción ('definida en el requerimiento técnico'). Por fila: " +
      "`sistema` = 'HubSpot' (o el sistema origen si la alimenta una integración) · `objeto` = 'Contacto' | 'Empresa' | 'Negocio' | 'Ticket' | objeto custom · " +
      "`campo` = el internal name propuesto entre backticks si está decidido; si no, describilo y marcá `⚠️ Por validar` — NUNCA inventes nombres del portal del cliente · " +
      "`tipo` = UNO de: texto | numero | fecha | booleano | enumeracion | moneda | id · `direccion` = entra | sale | ambas · " +
      "`esLlave` = 'si' SOLO para la propiedad que desduplica ese objeto · `obligatorio` = 'si' si sin ella el proceso no camina · " +
      "`descripcion` = para qué existe, en 1 línea sin jerga.",
    schema: {
      type: "object",
      properties: {
        intro: str,
        filas: arrayOf(
          { sistema: str, objeto: str, campo: str, tipo: str, direccion: str, esLlave: str, obligatorio: str, descripcion: str },
          ["sistema", "objeto", "campo"],
        ),
      },
      required: ["filas"],
    },
  },
  {
    key: "pipelines",
    label: "Pipelines y objetos",
    eyebrow: "Leads, negocios, tickets",
    theme: "light",
    sectionType: "process_mapping",
    agentGenerated: true,
    empty: PROCESS_MAPPING_EMPTY,
    agentHint: "Un 'proceso' por pipeline/objeto: etapas actuales del portal (o 'no existe') vs etapas propuestas con criterio de salida.",
    brief:
      "Los PIPELINES del portal, uno por objeto que el proyecto toca (Negocios, Tickets, Leads, objetos custom). Por pipeline: " +
      "`nombre` = el pipeline y su objeto ('Pipeline de ventas — Negocios'); `comoEsHoy` = las etapas que el portal tiene HOY (vienen en el contexto si hay cuenta conectada; si no existe el pipeline, decilo); " +
      "`comoSera` = las etapas propuestas EN ORDEN, cada una con su criterio de salida en pocas palabras ('Calificado → pasa cuando hay presupuesto confirmado'); `sistemas` = el objeto de HubSpot. " +
      "Las etapas salen de la PLANIFICACIÓN (procesos rediseñados + ciclo de vida) — no inventes etapas que el plan no justifica.",
    schema: asSchema(PROCESS_MAPPING_SCHEMA),
  },
  {
    key: "procesos_marketing",
    label: "Procesos de marketing",
    eyebrow: "Captura y nutrición",
    theme: "soft",
    sectionType: "kickoff_prose",
    agentGenerated: true,
    empty: proseEmpty,
    agentHint: "Los activos de marketing a montar: formularios, listas, scoring, nurturing. Solo si el proyecto cubre marketing.",
    brief:
      "Los activos de MARKETING a montar en el portal — SOLO si el alcance del proyecto cubre marketing (si no, dejá `items` vacío). " +
      "`items`: uno por activo — `title` = el activo ('Formulario de contacto del sitio', 'Lista de MQLs', 'Scoring de leads', 'Nurturing de bienvenida'); `detail` = UNA línea con el trigger y el objetivo ('Se dispara al descargar la guía; alimenta el scoring y notifica a ventas').",
    schema: asSchema(proseSchema),
  },
  {
    key: "prompts_breeze",
    label: "Prompts para Breeze",
    eyebrow: "Lo que Breeze construye",
    theme: "light",
    sectionType: "prompts_breeze",
    agentGenerated: true,
    empty: { intro: "", prompts: [] },
    agentHint:
      "Prompts LITERALES para que Breeze construya lo decidido arriba. `estado`: 'listo' si la spec de Breeze respalda que puede; 'sin_verificar' si no hay spec cargada.",
    brief:
      "Los prompts LITERALES para que Breeze (el agente de HubSpot) construya lo decidido en las secciones anteriores — un prompt que construye algo NO decidido arriba, sobra. `intro`: 1 frase con cómo usarlos. " +
      "`prompts`: uno por construcción — `titulo` = qué crea en 3-6 palabras ('Propiedades del objeto Negocio'); `objetivo` = 1 línea con el para qué; " +
      "`prompt` = EL TEXTO TAL CUAL SE PEGA en Breeze: una acción por prompt, nombrando objeto + internal name propuesto + tipo + opciones, y cerrando con el criterio de éxito ('Verificá que la propiedad aparezca en el objeto Negocio'). No encadenes más de 3 creaciones por prompt; " +
      "`precondicion` = qué debe existir antes ('Las propiedades de la fila 1-4' / 'Ninguna'); " +
      "`estado` = 'listo' si la SPEC DE BREEZE del contexto respalda que Breeze puede crear eso; 'sin_verificar' si no hay spec o no lo cubre — y en ese caso limitate a capacidades conservadoras (propiedades, listas, workflows básicos, formularios; pipelines y objetos custom NO se crean por Breeze).",
    schema: {
      type: "object",
      properties: {
        intro: str,
        prompts: arrayOf(
          { titulo: str, objetivo: str, prompt: str, precondicion: str, estado: str },
          ["titulo", "prompt"],
        ),
      },
      required: ["prompts"],
    },
  },
  {
    key: "a_mano",
    label: "Lo que va a mano",
    eyebrow: "El trabajo del CSE",
    theme: "soft",
    sectionType: "kickoff_prose",
    agentGenerated: true,
    empty: proseEmpty,
    agentHint: "Lo que Breeze no puede o no conviene: pipelines, vistas, permisos, automatizaciones finas, rutinas.",
    brief:
      "La lista de trabajo del CSE: lo que Breeze NO puede crear (pipelines y sus etapas, objetos custom, permisos y equipos, integraciones) o no conviene delegarle (automatizaciones finas, vistas por rol). " +
      "`items`: `title` = qué ('Pipeline de ventas con sus 5 etapas'); `detail` = UNA línea con dónde se configura y con qué criterio ('Settings → Objetos → Negocios; las etapas y criterios están en la sección Pipelines').",
    schema: asSchema(proseSchema),
  },
  {
    key: "cierre",
    label: "A construir",
    eyebrow: "A construir",
    theme: "dark",
    selfTitled: true,
    pinned: true,
    noHide: true,
    ctxDriven: true,
    sectionType: "implementacion_cta",
    agentGenerated: false, // CURADA
    empty: IMPLEMENTACION_CIERRE_DEFAULT,
    agentHint: "",
    brief: "Cierre curado: el arranque de la construcción. Botón opcional al portal del cliente o al tablero de trabajo.",
    schema: {
      type: "object",
      properties: { eyebrow: str, headline: str, subhead: str, buttonLabel: str, buttonUrl: str, buttonTarget: str },
    },
  },
];

/** Template del canvas Implementación para el agente tipado. */
export const IMPLEMENTACION_TEMPLATE: BcTemplateDef = {
  id: "implementacion_v1",
  caseLabel: "Implementación",
  // La tabla de propiedades + pipelines + prompts literales es lo más denso del motor.
  maxTokens: 18000,
  brandVoice: false, // guía INTERNA de trabajo
  features: { useCaseChecklist: false },
  agentIntro:
    "Eres el arquitecto de implementación de Smarteam que escribe la GUÍA DE CONSTRUCCIÓN de un portal de HubSpot: el documento con el que el CSE construye. Lo lee gente que va a ejecutar — precisión sobre prosa.\n\n" +
    "TU MÉTODO (el orden es la doctrina): PRIMERO la arquitectura — qué propiedades, qué pipelines con qué etapas, qué activos de marketing — derivada de la PLANIFICACIÓN aprobada y del REQUERIMIENTO TÉCNICO. RECIÉN DESPUÉS los prompts para Breeze: cada prompt construye algo decidido arriba, y un prompt que construye algo no decidido, sobra. Pedirle a Breeze que construya sin arquitectura es pedirle que la invente.\n\n" +
    "LA SPEC DE BREEZE: si el contexto trae la spec (qué puede y qué no puede crear Breeze), respetala al derivar los prompts y marcá `estado: 'listo'`. Si NO hay spec, generá igual con capacidades CONSERVADORAS (propiedades, listas, workflows básicos, formularios — pipelines, objetos custom y permisos NO) y marcá TODO `estado: 'sin_verificar'`: el CSE valida antes de pegar.\n\n" +
    "NO DUPLIQUES el requerimiento técnico: si el canvas de Desarrollo ya definió las propiedades de la integración, referencialas — dos fuentes de verdad divergen y alguien construye la vieja.\n\n" +
    "DISCIPLINA ANTI-ALUCINACIÓN: NUNCA inventes internal names del portal del cliente, ni etapas de pipeline que el plan no justifique. Lo no decidido va con `⚠️ Por validar`. El portal real (si viene en el contexto) manda sobre cualquier supuesto.\n\n" +
    "FORMATO: cada sección tiene su PROPIO shape (su `schema` y su guía). Los `detail` en UNA línea; los `prompt` LITERALES, listos para pegar. Español, tuteo. Arrays vacíos donde no haya respaldo.",
  sections: IMPLEMENTACION_SECTION_DEFS,
};

/** Lookup key → def. */
export const IMPLEMENTACION_DEF_BY_KEY: Record<string, BCSectionDef> = Object.fromEntries(
  IMPLEMENTACION_SECTION_DEFS.map((d) => [d.key, d]),
);

/** Los tags de conocimiento que definen el ALCANCE DE BREEZE (el gate los cuenta). */
export const BREEZE_KNOWLEDGE_TAGS = ["breeze_agents", "breeze_assistants"] as const;
