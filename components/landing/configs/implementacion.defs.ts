/**
 * components/landing/configs/implementacion.defs.ts
 *
 * Defs SERVER-SAFE del canvas "Implementación" — la GUÍA DE CONSTRUCCIÓN del CSE: qué
 * construir exactamente en el portal de HubSpot, y los prompts para que Breeze cree lo
 * que pueda. Documento INTERNO (paleta `stl-internal`).
 *
 * EL ORDEN ES LA DOCTRINA (decisión de negocio 2026-07-25): primero se decide la
 * ARQUITECTURA y RECIÉN AHÍ valen los prompts — pedirle a Breeze que construya sin
 * arquitectura decidida es pedirle que la invente. Desde el 2026-10-02 la arquitectura
 * (propiedades, pipelines, automatizaciones, conversaciones) se decide en la PLANIFICACIÓN,
 * que el cliente aprueba; esta guía la lee de ahí y dice CÓMO se construye. Las tres
 * secciones de arquitectura que vivían acá quedan solo-lectura hasta regenerar.
 *
 * EL GATE DE BREEZE: el alcance real de lo que Breeze puede hacer vive en la base de
 * conocimiento (docs HUBSPOT_SPEC con tags breeze_agents/breeze_assistants). Si no hay
 * ninguno PUBLICADO, el canvas lo avisa y el agente genera igual — marcando cada prompt
 * como "sin_verificar". Avisar, nunca bloquear: la doctrina de todo el sistema.
 */
import type { BCSectionDef } from "./business-case.defs";
import type { BcTemplateDef } from "./templates.defs";
import {
  PROCESS_MAPPING_SCHEMA,
  PROCESS_MAPPING_EMPTY,
  PROSA_SCHEMA,
  PROSA_EMPTY,
  PROSA_SCHEMA_DEL_CHAT,
} from "./shared-sections.defs";
import { IMPLEMENTACION_CIERRE_DEFAULT } from "@/lib/canvas/canvas-defs";
import { ACCIONES_SCHEMA, HERRAMIENTAS_SCHEMA } from "./diagnostico.defs";
import { heroTitleBrief } from "@/lib/landing/hero-title";

const str = { type: "string" } as const;
const strArray = { type: "array", items: { type: "string" } } as const;
const asSchema = (s: unknown) => s as unknown as Record<string, unknown>;
function arrayOf(props: Record<string, unknown>, required: string[]) {
  return { type: "array", items: { type: "object", properties: props, required } } as const;
}

/* ⭐ Las CINCO copias de este esquema se consolidaron en `shared-sections.defs.ts` el
   2026-08-23. El trinquete «un renderer, un contrato de datos» probó que eran idénticas; una sola
   constante hace que no puedan volver a divergir. `schemaDelChat` le suma `subhead`, que el chat
   escribe y el agente no: ver `PROSA_SCHEMA_DEL_CHAT`. */
const proseSchema = PROSA_SCHEMA;
const proseEmpty = PROSA_EMPTY;

export const IMPLEMENTACION_SECTION_DEFS: BCSectionDef[] = [
  {
    key: "implementacion",
    label: "Guía de construcción",
    eyebrow: "Ejecución",
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
      heroTitleBrief("Guía de construcción") +
      "Portada de la guía. `headline`: qué se construye PRIMERO y por qué ese orden ('Primero las propiedades de Negocio: todo lo demás las referencia'). " +
      "`subhead`: 1-2 frases con el estado de la decisión — de dónde sale esta guía (la planificación aprobada, el requerimiento técnico) y qué queda pendiente de decidir. " +
      "`tags`: los hubs/objetos que cubre ('Sales', 'Negocios', 'Tickets').",
    schema: { type: "object", properties: { titulo: str, headline: str, subhead: str, tags: strArray }, required: ["headline"] },
    /* ⭐ `eyebrow` SOLO acá y no en el esquema del agente: es el rótulo chico de arriba, lo
       cura una persona y `preserveNonSchemaKeys` lo acarrea entre regeneraciones. Hasta el
       2026-08-23 esta portada no tenía NINGUNA forma de cambiarlo: es `selfTitled`, así que
       `seccion.rotular` se rechaza —escribiría en una columna que nadie lee— y el renderer lo
       pintaba como texto pelado. Las dos puertas cerradas a la vez. */
    schemaDelChat: { type: "object", properties: { titulo: str, headline: str, subhead: str, tags: strArray, eyebrow: str } },
  },
  {
    /* SOLO-LECTURA desde el 2026-10-02. Las acciones (y las herramientas, abajo) vivieron acá del
       28-sep al 2-oct y volvieron al DIAGNÓSTICO, como en FUNDAUNA: son el «cómo lo vamos a
       resolver» que se le cuenta al cliente. Las guías de esos días las siguen mostrando hasta
       regenerarse; al regenerar, el runner las oculta (implementacion-generate.ts). */
    key: "acciones",
    label: "Acciones",
    eyebrow: "Qué nos hace falta",
    theme: "light",
    sectionType: "ejecucion_acciones",
    agentGenerated: false,
    empty: { intro: "", acciones: [] },
    agentHint: "",
    brief: "Sección legacy. Las acciones viven ahora en el diagnóstico («Acciones coherentes»).",
    // El MISMO esquema que en el diagnóstico: un tipo, un contrato de datos.
    schema: ACCIONES_SCHEMA as unknown as Record<string, unknown>,
  },
  {
    key: "herramientas",
    label: "Herramientas de HubSpot y para qué",
    eyebrow: "Con qué se construye",
    theme: "light",
    sectionType: "ejecucion_herramientas",
    agentGenerated: false,
    empty: { intro: "", herramientas: [] },
    agentHint: "",
    brief: "Sección legacy. Las herramientas viven ahora en el diagnóstico («Herramientas de HubSpot y para qué»).",
    schema: HERRAMIENTAS_SCHEMA as unknown as Record<string, unknown>,
  },
  {
    /* SOLO-LECTURA desde el 2026-10-02: las propiedades se mudaron a la PLANIFICACIÓN («Propiedades por
       objeto»). El esquema se queda igual: `props_table` lo comparte con Desarrollo («un renderer, un
       contrato de datos», lib/landing/registry.test.ts). */
    key: "arquitectura_propiedades",
    label: "Arquitectura de propiedades",
    eyebrow: "El diccionario del portal",
    theme: "light",
    sectionType: "props_table",
    agentGenerated: false,
    empty: { intro: "", filas: [] },
    agentHint: "",
    brief: "Sección legacy. Las propiedades viven ahora en la Planificación («Propiedades por objeto»).",
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
    /* SOLO-LECTURA desde el 2026-10-02: los pipelines se mudaron a la PLANIFICACIÓN, con etapas de verdad. */
    key: "pipelines",
    label: "Pipelines y objetos",
    eyebrow: "Leads, negocios, tickets",
    theme: "light",
    sectionType: "process_mapping",
    agentGenerated: false,
    empty: PROCESS_MAPPING_EMPTY,
    agentHint: "",
    brief: "Sección legacy. Los pipelines viven ahora en la Planificación («Tus pipelines»).",
    schema: asSchema(PROCESS_MAPPING_SCHEMA),
  },
  {
    /* SOLO-LECTURA desde el 2026-10-02: los activos de marketing se mudaron a las AUTOMATIZACIONES de la
       Planificación. */
    key: "procesos_marketing",
    label: "Procesos de marketing",
    eyebrow: "Captura y nutrición",
    theme: "soft",
    sectionType: "kickoff_prose",
    agentGenerated: false,
    empty: proseEmpty,
    agentHint: "",
    brief: "Sección legacy. Los activos de marketing viven ahora en la Planificación («Automatizaciones»).",
    schema: asSchema(proseSchema),
    schemaDelChat: asSchema(PROSA_SCHEMA_DEL_CHAT),
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
      "Los prompts LITERALES para que Breeze (el agente de HubSpot) construya lo decidido en la PLANIFICACIÓN (propiedades por objeto, pipelines, automatizaciones, conversaciones) — un prompt que construye algo que la planificación no decidió, sobra. `intro`: 1 frase con cómo usarlos. " +
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
      "`items`: `title` = qué ('Pipeline de ventas con sus 5 etapas'); `detail` = UNA línea con dónde se configura y con qué criterio ('Settings → Objetos → Negocios; las etapas y criterios están en «Tus pipelines» de la Planificación').",
    schema: asSchema(proseSchema),
    schemaDelChat: asSchema(PROSA_SCHEMA_DEL_CHAT),
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

/**
 * Lo que salió de Ejecución (al diagnóstico y a la planificación, el 2026-10-02) y sigue como def SOLO-LECTURA: las
 * guías viejas se ven igual hasta regenerarse; ahí el runner las oculta. Fuera del canon del canvas.
 */
export const SECCIONES_RETIRADAS_DE_EJECUCION = [
  "acciones",
  "herramientas",
  // Se mudaron a la Planificación el 2026-10-02.
  "arquitectura_propiedades",
  "pipelines",
  "procesos_marketing",
] as const;

/** Template del canvas Implementación para el agente tipado. */
export const IMPLEMENTACION_TEMPLATE: BcTemplateDef = {
  id: "implementacion_v1",
  caseLabel: "Ejecución",
  // Los prompts literales son densos (la arquitectura se decide en la Planificación desde el 2026-10-02).
  maxTokens: 18000,
  brandVoice: false, // guía INTERNA de trabajo
  features: { useCaseChecklist: false },
  agentIntro:
    "Eres el arquitecto de implementación de Smarteam que escribe la GUÍA DE CONSTRUCCIÓN de un portal de HubSpot: el documento con el que el CSE construye. Lo lee gente que va a ejecutar — precisión sobre prosa.\n\n" +
    "EL HILO: el DIAGNÓSTICO une el problema con códigos — síntomas S1…, causas F1…, objetivos OBJ-01… — y trae las ACCIONES (AC-01…) con sus herramientas: es el qué. Esta guía es el cómo se construye cada acción. Cita solo los códigos que existen en el diagnóstico.\n\n" +
    "TU MÉTODO (el orden es la doctrina): la arquitectura YA ESTÁ DECIDIDA en la PLANIFICACIÓN, que el cliente aprueba — propiedades por objeto, pipelines con sus etapas, automatizaciones y conversaciones (te llega en el contexto, solo lo visible). Tú no la rediseñas: escribes cómo se construye. Los prompts para Breeze construyen lo que la planificación decidió, y un prompt que construye algo que ella no decidió, sobra. Lo que la planificación marca como SUPUESTO o con algo por definir no se construye todavía: va a «Lo que va a mano» como pendiente de confirmar. Pedirle a Breeze que construya sin arquitectura es pedirle que la invente.\n\n" +
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
