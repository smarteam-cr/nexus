/**
 * components/landing/configs/kickoff.defs.ts
 *
 * Defs SERVER-SAFE (sin React) de las secciones del canvas "Kickoff", sobre el mismo
 * motor `LandingView` que los Business Cases. Fuente ÚNICA de key/label/eyebrow/theme/
 * schema/brief/empty/agentGenerated + el `KICKOFF_TEMPLATE` (BcTemplateDef) que consume
 * el agente tipado (F4). Se separa del registry client (`kickoff.ts`, que ata los
 * componentes) para que el código de servidor (seed, agente) importe solo esto.
 *
 * Diferencias con el BC:
 *  - solo hero (`bienvenida`) y `cierre` son `pinned` (bookends de posición fija).
 *  - cronograma/procesos/cierre son `ctxDriven` (se alimentan de ctx.kickoff, no de data →
 *    no se omiten por isBlank en read; su componente decide si devuelve null). Cronograma y
 *    procesos además son REORDENABLES: tienen CanvasSection (sin bloque) solo por el `order`.
 *  - equipo/horarios/canales son CURADAS (`agentGenerated:false`) — data estructurada que
 *    edita el CSE; el agente jamás las escribe.
 *
 * Orden canónico: hero primero; todo el contenido en el medio (reordenable por drag&drop,
 * incluidos cronograma y procesos); `cierre` pinneado al final.
 */
import type { BCSectionDef } from "./business-case.defs";
import type { BcTemplateDef } from "./templates.defs";
import { KICKOFF_CANALES_DEFAULT, KICKOFF_CIERRE_DEFAULT } from "@/lib/canvas/canvas-defs";

const str = { type: "string" } as const;
const strArray = { type: "array", items: { type: "string" } } as const;
function arrayOf(props: Record<string, unknown>, required: string[]) {
  return { type: "array", items: { type: "object", properties: props, required } } as const;
}
// Shape de PROSA (concisa, estilo presentación): intro opcional + items (title + detail
// opcional = bullet). Un solo componente `kickoff_prose` lo renderiza.
const proseSchema = {
  type: "object",
  properties: { intro: str, items: arrayOf({ title: str, detail: str }, ["title"]) },
  required: ["items"],
} as const;
const proseEmpty = { intro: "", items: [] };

export const KICKOFF_SECTION_DEFS: BCSectionDef[] = [
  {
    key: "bienvenida",
    label: "¡Arranquemos juntos!",
    eyebrow: "Kickoff del proyecto",
    theme: "dark",
    backdrop: true,
    selfTitled: true,
    pinned: true,
    noHide: true,
    sectionType: "kickoff_hero",
    agentGenerated: true,
    // `eyebrow`, `brands` y `coverImageUrl` quedan FUERA del schema: los cura el CSE y
    // los preserva `preserveNonSchemaKeys` en cada regeneración.
    empty: { headline: "", subhead: "", tags: [], brands: [] },
    agentHint: "Titular del kickoff + una bajada + 3-5 chips del alcance contratado.",
    brief:
      "Portada del kickoff. `headline`: SIEMPRE con el patrón `Inicio de proyecto: [qué se implementa][ e integración con [herramienta]]` — ej. 'Inicio de proyecto: implementación de HubSpot e integración con Aircall'. Sacá el 'qué se implementa' de los HUBS listados en los tags del proyecto y el 'con qué se integra' de la sección `desarrollo` / `alcance_contratado` del handoff (nombre propio de la herramienta: Aircall, SAP, ERP…). Si no hay integración, cortá el título ahí. `subhead`: UNA frase (máx. 25 palabras) que dice qué cambia para el negocio. `tags`: 3-5 chips cortos (2-4 palabras) del alcance CONTRATADO — hubs, integraciones y migraciones (ej. 'Sales Hub Pro', 'Integración Aircall', 'Migración desde Excel'). Fuente: tags del proyecto + handoff. No inventes herramientas.",
    schema: { type: "object", properties: { headline: str, subhead: str, tags: strArray }, required: ["headline", "subhead"] },
  },
  {
    key: "objetivos",
    label: "Objetivos del proyecto",
    eyebrow: "Lo que buscamos",
    theme: "light",
    sectionType: "kickoff_prose",
    agentGenerated: true,
    empty: { intro: "", items: [] },
    agentHint: "3-5 objetivos acordados, en cards de una línea.",
    brief:
      "3-5 objetivos del proyecto en el lenguaje del cliente. `title` = el objetivo en 3-6 palabras; `detail` = UNA línea de contexto (opcional, máx. 20 palabras). `intro` opcional: una frase. SOLO lo respaldado por el handoff — no inflar. Fuente: `alcance_contratado` y `expectativas`. La comparación Hoy/Con-el-sistema NO va acá (tiene su propia sección).",
    schema: { type: "object", properties: { intro: str, items: arrayOf({ title: str, detail: str }, ["title"]) }, required: ["items"] },
  },
  {
    key: "hoy_vs_sistema",
    label: "Del hoy al nuevo sistema",
    eyebrow: "Qué cambia",
    theme: "soft",
    sectionType: "kickoff_compara",
    agentGenerated: true,
    empty: { subhead: "", hoy: [], conSistema: [] },
    agentHint: "Contraste directo: cómo opera hoy vs cómo va a operar.",
    brief:
      "Contraste directo. `subhead`: UNA frase de dónde partimos y a dónde llegamos. `hoy`: 2-4 bullets de cómo opera HOY (el dolor real, con sus palabras), una línea cada uno. `conSistema`: 2-4 bullets de cómo va a operar, y cada uno RESPONDE a un bullet de `hoy` en el mismo orden. Concreto, no aspiracional. Fuente: `dolor_principal` + `alcance_contratado`. Si el handoff no trae el estado actual, dejá ambas listas vacías.",
    schema: { type: "object", properties: { subhead: str, hoy: strArray, conSistema: strArray }, required: [] },
  },
  {
    key: "alcance",
    label: "Alcance: qué incluye",
    eyebrow: "El trabajo",
    theme: "soft",
    sectionType: "kickoff_prose",
    agentGenerated: true,
    empty: proseEmpty,
    agentHint: "Lista corta de lo CONTRATADO: módulos, integraciones, lo que se configura.",
    brief:
      "4-7 cards de lo CONTRATADO (módulos, integraciones, migraciones, lo que se configura). `title` = el entregable en 3-6 palabras; `detail` = UNA línea de qué incluye (opcional). SOLO lo respaldado por `alcance_contratado` y `desarrollo` del handoff — no inflar ni agregar módulos no vendidos.",
    schema: proseSchema,
  },
  {
    key: "equipo",
    label: "El equipo del proyecto",
    eyebrow: "Quiénes somos",
    theme: "light",
    sectionType: "kickoff_equipo",
    agentGenerated: false,
    empty: { members: [] },
    agentHint: "",
    brief: "Curada por el CSE: selecciona los miembros que participan (con foto). El agente NO la genera.",
    schema: {},
  },
  {
    key: "tu_rol",
    label: "Lo que necesitamos de tu equipo",
    eyebrow: "Tu parte",
    theme: "soft",
    sectionType: "kickoff_prose",
    agentGenerated: true,
    empty: proseEmpty,
    agentHint: "3-5 pedidos accionables al equipo del cliente (disponibilidad, accesos, decisores, datos).",
    brief:
      "3-5 cards accionables de lo que necesitás del equipo del cliente. `title` = el pedido en 3-6 palabras (disponibilidad, accesos, decisores, datos); `detail` = UNA línea con de quién o para cuándo. Fuente: `stakeholders_handoff` + `desarrollo` + el cronograma.",
    schema: proseSchema,
  },
  {
    key: "metricas_exito",
    label: "Cómo mediremos el éxito",
    eyebrow: "La medición",
    theme: "light",
    sectionType: "kickoff_prose",
    agentGenerated: true,
    empty: proseEmpty,
    agentHint: "3-4 métricas de éxito, una línea cada una.",
    brief:
      "3-4 cards de métricas. `title` = la métrica en 3-6 palabras; `detail` = UNA línea de cómo se mide. Si el handoff no trae métricas, formulalas como PROPUESTA ('Proponemos medir…'), nunca como algo ya acordado. Fuente: `expectativas`. Nunca inventes cifras.",
    schema: proseSchema,
  },
  {
    key: "horarios",
    label: "Sesiones y horarios",
    eyebrow: "La cadencia",
    theme: "soft",
    sectionType: "kickoff_horarios",
    agentGenerated: false,
    empty: { intro: "", options: [], sessions: [] },
    agentHint: "",
    brief: "Curada por el CSE: franjas ofrecidas + sesiones (drag&drop para asignar). El agente NO la genera.",
    schema: {},
  },
  {
    key: "canales",
    label: "Canales de atención",
    eyebrow: "El acompañamiento",
    theme: "light",
    sectionType: "kickoff_canales",
    agentGenerated: false,
    empty: { ...KICKOFF_CANALES_DEFAULT },
    agentHint: "",
    brief: "Curada por el CSE: horario, canales y correo de soporte. El agente NO la genera.",
    schema: {},
  },
  {
    key: "proximos_pasos",
    label: "Próximos pasos",
    eyebrow: "El arranque",
    theme: "soft",
    sectionType: "kickoff_prose",
    agentGenerated: true,
    empty: proseEmpty,
    agentHint: "3-5 primeros pasos tras el kickoff. NO reproducir la lista de fases del cronograma.",
    brief:
      "3-5 cards con los primeros pasos tras el kickoff. `title` = el paso en 3-6 palabras; `detail` = UNA línea. Referenciá el arranque, pero NO reproduzcas la lista de fases del cronograma (ya se muestra en su propia sección). Fuente: `fecha_inicio_kickoff` + primeras fases del cronograma.",
    schema: proseSchema,
  },
  // ── ctxDriven: se alimentan de ctx.kickoff, no de CanvasBlock ──────────────────
  // NO son `pinned`: tienen CanvasSection propia (sin bloque) solo para llevar un `order`
  // persistido → el CSE las arrastra como a cualquier otra sección.
  {
    key: "cronograma",
    label: "Cronograma del proyecto",
    eyebrow: "Hoja de ruta",
    theme: "light",
    selfTitled: true,
    ctxDriven: true,
    ctxEmpty: (ctx) => {
      const t = ctx.kickoff?.timeline;
      return !t?.exists || (t.phases?.length ?? 0) === 0;
    },
    sectionType: "kickoff_timeline",
    agentGenerated: false,
    empty: {},
    agentHint: "",
    brief: "Fuente única: ProjectTimeline (el agente NO lo genera).",
    schema: {},
  },
  {
    key: "procesos",
    label: "Nuestros procesos",
    eyebrow: "Cómo trabajamos",
    theme: "soft",
    selfTitled: true,
    ctxDriven: true,
    ctxEmpty: (ctx) => (ctx.kickoff?.procesos?.length ?? 0) === 0,
    sectionType: "kickoff_procesos",
    agentGenerated: false,
    empty: {},
    agentHint: "",
    brief: "Diagramas de proceso del cliente (flowcharts). El agente NO los genera.",
    schema: {},
  },
  {
    key: "cierre",
    label: "Cierre y llamado a la acción",
    eyebrow: "El siguiente paso",
    theme: "dark",
    // SIN `backdrop`: hoy sería inerte (la rama `ctxDriven` de LandingView retorna antes de
    // asignar el `heroRef`), pero dejarlo es una trampa — `bienvenida` y `cierre` se
    // pelearían el ref del parallax si esta sección dejara de ser ctxDriven.
    selfTitled: true,
    pinned: true,
    noHide: true,
    ctxDriven: true, // rinde su propia sección dark full-bleed; además lee `data` (CTA)
    sectionType: "kickoff_cta",
    agentGenerated: false, // CURADA: el CSE edita el titular + configura el botón. El agente NO la genera.
    empty: { ...KICKOFF_CIERRE_DEFAULT },
    agentHint: "",
    brief: "Cierre + CTA (curado por el CSE): titular, subtítulo y botón configurable (texto + enlace).",
    schema: {
      type: "object",
      properties: { eyebrow: str, headline: str, subhead: str, buttonLabel: str, buttonUrl: str, buttonTarget: str },
    },
  },
];

/** Template del kickoff para el agente tipado (F4). El input NO son transcripts crudos:
 *  es el handoff curado + el cronograma (lo arma la rama isKickoffAgent de analyze). */
export const KICKOFF_TEMPLATE: BcTemplateDef = {
  // maxTokens 10000: el hero (titular + bajada + tags) y la sección comparativa suman
  // salida; `generateSectionsForTemplate` ABORTA si `stop_reason === "max_tokens"`.
  id: "kickoff_v1",
  caseLabel: "Kickoff",
  maxTokens: 10000,
  features: { useCaseChecklist: false },
  agentIntro:
    "Eres Consultor de Customer Success de Smarteam y escribes la LANDING DE KICKOFF que verá el CLIENTE el día que arranca su proyecto. Ya te compraron: esto NO es un segundo pitch, es el arranque. Registro de POST-VENTA.\n\n" +

    "FUENTE ÚNICA: el bloque de handoff + los tags + el cronograma del mensaje. No inventes NADA que no esté ahí.\n\n" +

    "ESTO ES UNA PRESENTACIÓN, NO UN DOCUMENTO. Se proyecta en pantalla, en vivo. Reglas DURAS de formato:\n" +
    "• NINGÚN campo de texto supera 2 líneas (~25 palabras).\n" +
    "• Los `title` de las cards: 3 a 6 palabras. Nada de oraciones.\n" +
    "• Los `detail` y los bullets: UNA línea. Si no cabe en una línea, sobra.\n" +
    "• Cero relleno, cero conectores de ensayo ('en este sentido', 'cabe destacar'). Quedarse corto es mejor que pasarse.\n\n" +

    "JERARQUÍA DE COPY: cada card es un gancho (título) + una prueba (detalle). El título dice QUÉ; el detalle dice CON QUÉ o PARA QUÉ. Nunca repitas el título en el detalle.\n\n" +

    "VOZ — concreta, específica, con las palabras del negocio del cliente:\n" +
    "• MAL: 'Optimizaremos tus procesos comerciales para maximizar el valor.' (genérico, intercambiable, promete de más)\n" +
    "• BIEN: 'Tu pipeline deja Excel y vive en Sales Hub.' (concreto, verificable, en su lenguaje)\n" +
    "• MAL: 'Garantizamos un ROI significativo.' (prohibido: no prometas resultados)\n" +
    "• BIEN: 'Vas a ver cada oportunidad y su etapa sin pedir reportes.' (describe la capacidad, no el resultado)\n" +
    "PROHIBIDO: 'maximizar el valor', 'ROI garantizado', 'solución integral', 'llevar al siguiente nivel'.\n\n" +

    "NO USES LAS SECCIONES INTERNAS DEL HANDOFF. Los riesgos, banderas rojas, el 'por qué nos eligieron', los acuerdos comerciales y el estado interno son de Smarteam: el cliente NO los ve, ni siquiera reformulados. Si una sección te llega, ignorala.\n\n" +

    "TUTEO SIEMPRE (tú: tienes, necesitas, podrás). Prohibido voseo/ustedeo.\n\n" +

    "DISCIPLINA: el alcance es el CONTRATADO y los objetivos los ACORDADOS (no inflar). Las métricas, si no están en el handoff, se formulan como PROPUESTA de Smarteam. Si una sección no tiene respaldo en la fuente, dejá sus campos VACÍOS — vacío es correcto, inventado es un error.",
  sections: KICKOFF_SECTION_DEFS,
};

/** Lookup key → def (para el seed y el agente). */
export const KICKOFF_DEF_BY_KEY: Record<string, BCSectionDef> = Object.fromEntries(
  KICKOFF_SECTION_DEFS.map((d) => [d.key, d]),
);

/**
 * ALLOWLIST de secciones del canvas Handoff que puede ver el agente del kickoff.
 * El kickoff lo lee el CLIENTE: las secciones INTERNAS de Smarteam quedan fuera de la
 * fuente, no solo prohibidas en el prompt. Excluidas a propósito:
 *   `acuerdos_promesas` (compromisos comerciales), `motivacion_decision` (por qué nos
 *   eligieron), `estado_en_flight` (estado interno), `riesgos_banderas` (riesgos).
 */
export const KICKOFF_HANDOFF_KEYS = [
  "fecha_inicio_kickoff",
  "alcance_contratado",
  "desarrollo",
  "dolor_principal",
  "expectativas",
  "stakeholders_handoff",
] as const;
