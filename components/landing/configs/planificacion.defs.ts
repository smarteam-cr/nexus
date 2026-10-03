/**
 * components/landing/configs/planificacion.defs.ts
 *
 * Defs SERVER-SAFE del canvas "Planificación" — lo que va a quedar CONFIGURADO en HubSpot, armado
 * por fuera para que el cliente lo vea y lo apruebe antes de configurar (2026-10-02). Caroline la
 * presenta como la arquitectura de HubSpot; se llama «Planificación» para que el equipo piense en
 * estrategia y no solo en HubSpot.
 *
 * Secciones: portada · cómo van a funcionar los procesos (solo lo que se hará) · etapas del ciclo de
 * vida · arquitectura · propiedades por objeto · pipelines (leads, ventas, servicio) ·
 * automatizaciones · conversaciones (mensajería instantánea y agentes de IA) · rutinas de adopción y
 * despliegue por olas (hasta que exista el documento de Puesta en marcha) · aprobación. TODAS se
 * pueden ocultar, también la portada y la aprobación.
 *
 * Lo que salió: la política rectora (al Diagnóstico), la hoja de ruta (el orden vive en el Cronograma
 * y en las acciones del Diagnóstico) y las métricas de éxito (los OBJ del Diagnóstico). Quedan al
 * final como defs SOLO-LECTURA hasta que la planificación se regenera.
 *
 * Propiedades, pipelines y automatizaciones vinieron de Ejecución
 * (scripts/migrar-planificacion-practica.ts pasa el contenido que ya existía).
 *
 * `plan_despliegue` es CONDICIONAL por diseño: el agente la deja VACÍA cuando la
 * adopción es directa (equipo chico) — vacía → blank → el modo lectura la omite solo.
 */
import type { BCSectionDef } from "./business-case.defs";
import type { BcTemplateDef } from "./templates.defs";
import {
  ROI_SCHEMA,
  ROI_EMPTY,
  makeDiagramArchitectureDef,
  PROSA_SCHEMA,
  PROSA_EMPTY,
  PROSA_SCHEMA_DEL_CHAT,
} from "./shared-sections.defs";
import { PLANIFICACION_CIERRE_DEFAULT } from "@/lib/canvas/canvas-defs";
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

/* El ORIGEN de cada cosa que se configura (lib/planificacion/origen.ts). Va en la guía de cada sección
   con la misma letra: si cambia, cambia acá. */
const ORIGEN_BRIEF =
  "`origen` = 'acordado' SOLO si una reunión con el cliente lo respalda (nómbrala en `fuente`: 'Sesión Ventas 3'); 'propuesta' si es diseño de Smarteam; 'supuesto' si das por hecho algo del cliente que nadie dijo. " +
  "Lo que solo dice una nota interna o el handoff NO es 'acordado': es 'propuesta' o 'supuesto'.";

export const PLANIFICACION_SECTION_DEFS: BCSectionDef[] = [
  {
    key: "planificacion",
    label: "Plan de implementación",
    eyebrow: "Planificación",
    theme: "dark",
    backdrop: true,
    selfTitled: true,
    pinned: true,
    // Se puede OCULTAR (2026-10-02): todas las secciones de la Planificación tienen el ojo.
    sectionType: "planificacion_hero",
    agentGenerated: true,
    empty: { titulo: "", headline: "", subhead: "", tags: [] },
    agentHint: "Qué va a quedar configurado en HubSpot + la decisión de arquitectura clave.",
    brief:
      heroTitleBrief("Plan de implementación") +
      "Portada del plan. `headline`: QUÉ va a quedar configurado en HubSpot, en una línea de negocio ('Un portal que centraliza leads, admisión y tickets para los cinco proyectos'). " +
      "`subhead`: 1-2 frases con la decisión de arquitectura más importante y qué muestra el documento (procesos, etapas, propiedades, pipelines, automatizaciones, conversaciones). " +
      "`tags`: 2-5 chips con los hubs o frentes ('Sales Hub', 'Service Hub', 'Multi-proyecto').",
    schema: { type: "object", properties: { titulo: str, headline: str, subhead: str, tags: strArray }, required: ["headline"] },
    /* ⭐ `eyebrow` SOLO acá y no en el esquema del agente: es el rótulo chico de arriba, lo
       cura una persona y `preserveNonSchemaKeys` lo acarrea entre regeneraciones. Hasta el
       2026-08-23 esta portada no tenía NINGUNA forma de cambiarlo: es `selfTitled`, así que
       `seccion.rotular` se rechaza —escribiría en una columna que nadie lee— y el renderer lo
       pintaba como texto pelado. Las dos puertas cerradas a la vez. */
    schemaDelChat: { type: "object", properties: { titulo: str, headline: str, subhead: str, tags: strArray, eyebrow: str } },
  },
  {
    /* 2026-10-02 — SOLO lo que se hará. El «hoy / cómo será» se partió: cómo operan hoy vive en el
       Diagnóstico («Cómo operas hoy»), y acá queda cómo van a funcionar, paso a paso. Misma key:
       lo ya generado se lee con `adoptarProcesos` (el párrafo «cómo será» se muestra hasta regenerar). */
    key: "definicion_procesos",
    label: "Cómo van a funcionar tus procesos",
    eyebrow: "Lo que se hará",
    theme: "light",
    sectionType: "procesos_futuro",
    agentGenerated: true,
    empty: { intro: "", procesos: [] },
    agentHint: "Por proceso: titular de cómo va a funcionar + 3-6 pasos en orden, cada uno con su origen.",
    brief:
      "Cómo van a funcionar en HubSpot los procesos que el proyecto toca — SOLO lo que se hará: NO describas cómo operan hoy (eso está en el Diagnóstico). " +
      "`procesos`: uno por proceso — `nombre` en lenguaje del cliente ('Captación y calificación de leads'); `resumen` = titular de media línea con cómo va a funcionar ('Todo lead entra a HubSpot y llega solo al proyecto correcto'); `fuente` = las reuniones que lo respaldan; " +
      "`pasos` (3-6, en orden): `paso` = qué pasa, en una línea ('El nombre del formulario lo asigna al proyecto'); `detalle` = opcional, una línea; " + ORIGEN_BRIEF + " " +
      "Parte de los procesos que el cliente describió (sus mapas y las reuniones): si un proceso no se habló, no lo inventes.",
    schema: {
      type: "object",
      properties: {
        intro: str,
        procesos: arrayOf(
          { nombre: str, resumen: str, fuente: str, pasos: arrayOf({ paso: str, detalle: str, origen: str }, ["paso"]) },
          ["nombre"],
        ),
      },
      required: ["procesos"],
    },
  },
  {
    key: "ciclo_vida_crm",
    label: "Etapas del ciclo de vida",
    eyebrow: "Del lead al cliente",
    theme: "soft",
    sectionType: "ciclo_vida_tabla",
    agentGenerated: true,
    empty: { intro: "", etapas: [] },
    agentHint: "Una fila por etapa: cuándo entra, qué la mueve, si es nueva/se mantiene/se renombra, y su origen.",
    brief:
      "Las etapas del ciclo de vida del CRM del CLIENTE (suscriptor → lead → … → cliente), como van a quedar. `intro`: de dónde parte ('Tu portal arranca desde cero' o 'Hoy tu portal usa N etapas; proponemos M'). " +
      "`etapas`: una por etapa — `etapa` = su nombre ('Lead calificado'); `entraCuando` = UNA línea con el criterio de entrada; `laMueve` = quién o qué la mueve ('El agente', 'Automatización al ganar el negocio'); " +
      "`cambio` = UNO de: nueva | se_mantiene | renombrada | se_quita; " + ORIGEN_BRIEF + " " +
      "Si el portal ya tiene etapas (vienen en el contexto), parte de esas y propone SOLO los cambios que los procesos justifican. No renombres por gusto.",
    schema: {
      type: "object",
      properties: {
        intro: str,
        etapas: arrayOf({ etapa: str, entraCuando: str, laMueve: str, cambio: str, origen: str }, ["etapa"]),
      },
      required: ["etapas"],
    },
  },
  makeDiagramArchitectureDef({
    key: "arquitectura_solucion",
    label: "Arquitectura de la solución",
    eyebrow: "Sistemas y conexiones",
    agentGenerated: true,
  }),
  {
    /* 2026-10-02 — vino de Ejecución («Arquitectura de propiedades»). Forma nueva pensada para las
       plantillas de Excel de Caroline: lib/planificacion/propiedades.ts. `id`, `autor` y `extra` van
       FUERA del esquema: el agente no los escribe, y el runner conserva las filas de una persona. */
    key: "propiedades",
    label: "Propiedades por objeto",
    eyebrow: "Lo que guarda cada objeto",
    theme: "soft",
    sectionType: "propiedades_objeto",
    agentGenerated: true,
    empty: { intro: "", filas: [] },
    agentHint: "Una fila por propiedad a crear o ajustar, agrupadas por objeto. Nombre interno con `⚠️ Por validar` si no está decidido.",
    brief:
      "Las PROPIEDADES que se crean o se ajustan en HubSpot, por objeto. `intro`: 1 frase opcional. `filas`: una por propiedad, agrupadas por objeto (todas las de Contacto juntas, después Empresa, Lead, Negocio, Ticket, objetos personalizados). Por fila: " +
      "`objeto` = Contacto | Empresa | Lead | Negocio | Ticket | el objeto personalizado; `grupo` = el grupo de propiedades en HubSpot si se habló, si no vacío; `etiqueta` = el nombre que ve el usuario ('Tipo de programa'); " +
      "`campo` = el nombre interno propuesto entre backticks si está decidido; si no, `⚠️ Por validar` — NUNCA inventes nombres internos del portal del cliente; " +
      "`tipo` = UNO de: texto | texto_largo | numero | moneda | fecha | fecha_hora | desplegable | opcion_unica | casillas | casilla | telefono | archivo | usuario | calculo; " +
      "`opciones` = las opciones de un desplegable o de casillas separadas por ' · ' (si no se definieron, `⚠️ Por definir`); `obligatoria` = 'si' si sin ella el proceso no camina, si no 'no'; " +
      "`estado` = nueva | existente | ajustar; `uso` = para qué existe, en 1 línea sin jerga; " + ORIGEN_BRIEF + " " +
      "Las propiedades de una INTEGRACIÓN ya están en el requerimiento técnico: no las repitas acá.",
    schema: {
      type: "object",
      properties: {
        intro: str,
        filas: arrayOf(
          {
            objeto: str, grupo: str, etiqueta: str, campo: str, tipo: str, opciones: str,
            obligatoria: str, estado: str, uso: str, origen: str, fuente: str,
          },
          ["objeto", "etiqueta"],
        ),
      },
      required: ["filas"],
    },
  },
  {
    /* 2026-10-02 — vino de Ejecución («Pipelines y objetos», que era texto). Ahora con etapas de verdad,
       que se ven de izquierda a derecha. Lo que vino de Ejecución se lee con `adoptarPipelines`. */
    key: "pipelines",
    label: "Tus pipelines",
    eyebrow: "Leads, ventas y servicio",
    theme: "light",
    sectionType: "pipelines_horizontal",
    agentGenerated: true,
    empty: { intro: "", pipelines: [] },
    agentHint: "Un pipeline por proceso (leads, ventas, servicio): etapas en orden con cuándo entra y qué se pide para avanzar.",
    brief:
      "Los PIPELINES que van a quedar en HubSpot, en este orden: leads, ventas, servicio (y otros si el alcance los trae). `pipelines`: uno por pipeline — " +
      "`tipo` = UNO de: leads | ventas | servicio | otro; `nombre` = el pipeline ('Admisión de posgrados'); `objeto` = el objeto de HubSpot y una aclaración corta ('Negocio · requisitos de admisión'); `nota` = opcional, una línea (si hay pipelines hermanos, nómbralos acá: 'También: Educación continua y Laboratorio'); " + ORIGEN_BRIEF + " " +
      "`etapas` (en orden, de izquierda a derecha): `etapa` = su nombre; `entraCuando` = UNA línea; `requisitos` = las propiedades que tienen que estar completas para avanzar, separadas por comas (vacío si no hay); `cierre` = 'ganado' o 'perdido' si la etapa cierra el pipeline, si no vacío; `origen` como arriba. " +
      "Las etapas salen de los procesos y de las reuniones: no inventes etapas que nadie justificó. Solo los pipelines que el alcance incluye.",
    schema: {
      type: "object",
      properties: {
        intro: str,
        pipelines: arrayOf(
          {
            tipo: str, nombre: str, objeto: str, nota: str, origen: str,
            etapas: arrayOf({ etapa: str, entraCuando: str, requisitos: str, cierre: str, origen: str }, ["etapa"]),
          },
          ["tipo", "nombre"],
        ),
      },
      required: ["pipelines"],
    },
  },
  {
    /* 2026-10-02 — «Automatizaciones» (no «Workflows», decisión de Elías). Absorbe los «Procesos de
       marketing» de Ejecución: un nurturing o un scoring también son automatizaciones. */
    key: "automatizaciones",
    label: "Automatizaciones",
    eyebrow: "Lo que pasa solo",
    theme: "soft",
    sectionType: "automatizaciones",
    agentGenerated: true,
    empty: { intro: "", items: [] },
    agentHint: "Una por automatización: dónde (objeto · hub), cuándo se dispara, qué hace, qué resuelve, qué falta definir.",
    brief:
      "Las AUTOMATIZACIONES que se van a construir (workflows, secuencias, asignaciones, scoring, nurturing). `items`: una por automatización — " +
      "`nombre` = qué hace en 3-6 palabras ('Asignar el lead a su proyecto'); `donde` = objeto · hub ('Contacto · Marketing Hub'); `cuando` = qué la dispara; `hace` = qué hace, en una línea; `resuelve` = qué problema del cliente resuelve; " +
      "`falta` = lo que todavía no está definido ('Cada cuánto y cuántas veces'), vacío si nada; " + ORIGEN_BRIEF + " " +
      "Solo las que el alcance incluye y las reuniones o los procesos justifican.",
    schema: {
      type: "object",
      properties: {
        intro: str,
        items: arrayOf(
          { nombre: str, donde: str, cuando: str, hace: str, resuelve: str, falta: str, origen: str, fuente: str },
          ["nombre"],
        ),
      },
      required: ["items"],
    },
  },
  {
    /* 2026-10-02 — «Conversaciones» (no «Chatbots», decisión de Elías): la mensajería instantánea que
       entra a la bandeja de HubSpot y quién responde en cada canal, incluidos los agentes de IA para
       WhatsApp. */
    key: "conversaciones",
    label: "Conversaciones",
    eyebrow: "Mensajería instantánea y agentes de IA",
    theme: "light",
    sectionType: "conversaciones",
    agentGenerated: true,
    empty: { intro: "", items: [] },
    agentHint: "Un canal o agente por item: canal, quién responde (persona, chatbot, agente de IA), a quién pasa, qué registra.",
    brief:
      "Los canales de MENSAJERÍA INSTANTÁNEA que entran a la bandeja de conversaciones de HubSpot (WhatsApp, chat del sitio, Messenger, Instagram) y quién responde en cada uno. `intro`: 1 frase opcional. `items`: uno por canal o por agente — " +
      "`nombre` = 'WhatsApp en la bandeja de HubSpot' o 'Agente de IA en WhatsApp'; `canal` = canal · hub ('WhatsApp Business · Service Hub'); `responde` = UNO de: persona | chatbot | agente_ia; " +
      "`paraQue` = para qué sirve; `pasaA` = a quién pasa la conversación y cuándo; `registra` = qué crea o actualiza en HubSpot; `falta` = lo que no está definido (paquete, horario, preguntas frecuentes), vacío si nada; " + ORIGEN_BRIEF + " " +
      "Si el alcance no incluye mensajería, deja `items` vacío: la sección no se muestra.",
    schema: {
      type: "object",
      properties: {
        intro: str,
        items: arrayOf(
          { nombre: str, canal: str, responde: str, paraQue: str, pasaA: str, registra: str, falta: str, origen: str, fuente: str },
          ["nombre"],
        ),
      },
      required: ["items"],
    },
  },
  {
    /* Se queda acá hasta que exista el documento de Puesta en marcha (entrenamiento y adopción), que es
       a donde va. Mientras tanto no se esconde: no tiene otro lugar donde verse. */
    key: "rutinas_adopcion",
    label: "Rutinas de adopción",
    eyebrow: "Quién, con qué cadencia",
    theme: "soft",
    sectionType: "kickoff_prose",
    agentGenerated: true,
    empty: proseEmpty,
    agentHint: "Una rutina por item: quién + cadencia + qué mira. La modalidad (directa/pilotos) se declara en la intro.",
    brief:
      "Las rutinas que hacen que el CRM se USE — sin esto, la configuración es un mueble. `intro`: 1 frase que declara la modalidad de adopción del plan (directa o por pilotos) y por qué. " +
      "`items` (3-6): `title` = la rutina ('Revisión semanal de pipeline'); `detail` = UNA línea con QUIÉN la hace + CADENCIA + QUÉ mira ('Gerente comercial, lunes: negocios sin actividad hace 7 días y etapas estancadas'). " +
      "Rutinas para los roles que el proyecto involucra — no inventes cargos que la fuente no menciona.",
    schema: asSchema(proseSchema),
    schemaDelChat: asSchema(PROSA_SCHEMA_DEL_CHAT),
  },
  {
    key: "plan_despliegue",
    label: "Plan de despliegue por olas",
    eyebrow: "Piloto escalonado",
    theme: "light",
    sectionType: "kickoff_prose",
    agentGenerated: true,
    empty: proseEmpty,
    agentHint: "SOLO si la adopción es por pilotos. Adopción directa → déjala VACÍA (vacía = no se muestra).",
    brief:
      "SOLO para adopción POR PILOTOS (equipos grandes). Si la modalidad es DIRECTA, deja `items` VACÍO — una sección vacía no se muestra, y eso es lo correcto. " +
      "`intro`: el criterio de la ola inicial. `items`: una OLA por item — `title` = 'Ola 1 — Equipo comercial de CR'; `detail` = UNA línea con quiénes entran + qué módulos usan + el indicador de éxito para pasar a la siguiente ola ('5 vendedores, pipeline + tareas; pasan cuando el 80% registra su actividad sin recordatorios').",
    schema: asSchema(proseSchema),
    schemaDelChat: asSchema(PROSA_SCHEMA_DEL_CHAT),
  },
  {
    key: "cierre",
    label: "Aprobación",
    eyebrow: "Aprobación",
    theme: "dark",
    selfTitled: true,
    pinned: true,
    // Se puede OCULTAR (2026-10-02), como todas las de la Planificación.
    ctxDriven: true,
    sectionType: "planificacion_cta",
    agentGenerated: false, // CURADA: la escribe el equipo
    empty: PLANIFICACION_CIERRE_DEFAULT,
    agentHint: "",
    brief:
      "Cierre curado: el plan se aprueba con el cliente antes de configurar HubSpot. Botón opcional a la sesión de aprobación o al documento firmado.",
    schema: {
      type: "object",
      properties: { eyebrow: str, headline: str, subhead: str, buttonLabel: str, buttonUrl: str, buttonTarget: str },
    },
  },

  /* ── SOLO-LECTURA: lo que salió de la Planificación ──────────────────────────────────────────────
     Una planificación vieja las sigue mostrando igual hasta regenerarse; al regenerar, el runner las
     OCULTA (sin borrar). No están en el canon del canvas: uno nuevo no las crea. */
  {
    /* La política rectora vivió acá del 28-sep al 2-oct y volvió al DIAGNÓSTICO (la parte teórica). */
    key: "politica_rectora",
    label: "Política rectora",
    eyebrow: "En qué nos enfocamos y para qué",
    theme: "dark",
    sectionType: "kickoff_prose",
    agentGenerated: false,
    empty: proseEmpty,
    agentHint: "",
    brief: "Sección legacy. La política rectora vive ahora en el diagnóstico, al lado del desafío principal.",
    schema: asSchema(proseSchema),
    schemaDelChat: asSchema(PROSA_SCHEMA_DEL_CHAT),
  },
  {
    /* 2026-10-02 — se retira: el orden del trabajo ya está en el Cronograma y en las acciones del
       Diagnóstico. La Planificación quedó en lo que se configura. */
    key: "roadmap",
    label: "Hoja de ruta",
    eyebrow: "En qué orden",
    theme: "light",
    sectionType: "kickoff_prose",
    agentGenerated: false,
    empty: proseEmpty,
    agentHint: "",
    brief: "Sección legacy. El orden del trabajo vive en el Cronograma y en las acciones del Diagnóstico.",
    schema: asSchema(proseSchema),
    schemaDelChat: asSchema(PROSA_SCHEMA_DEL_CHAT),
  },
  {
    /* 2026-10-02 — se retira: los objetivos medibles son los OBJ del Diagnóstico. */
    key: "metricas_exito",
    label: "Métricas de éxito",
    eyebrow: "Cómo sabremos que funcionó",
    theme: "dark",
    sectionType: "roi",
    agentGenerated: false,
    empty: ROI_EMPTY,
    agentHint: "",
    brief: "Sección legacy. Los objetivos medibles viven en el Diagnóstico (OBJ).",
    schema: asSchema(ROI_SCHEMA),
  },
];

/**
 * Lo que salió de Planificación y sigue como def SOLO-LECTURA (las planificaciones viejas se ven igual
 * hasta regenerarse; ahí el runner las oculta). No está en el canon del canvas: uno nuevo no la crea.
 */
export const SECCIONES_RETIRADAS_DE_PLANIFICACION = ["politica_rectora", "roadmap", "metricas_exito"] as const;

/** Template del canvas Planificación para el agente tipado. */
export const PLANIFICACION_TEMPLATE: BcTemplateDef = {
  id: "planificacion_v1",
  caseLabel: "Planificación",
  // Procesos con pasos + ciclo de vida + diagrama + propiedades + pipelines con etapas + automatizaciones
  // + conversaciones + rutinas: lo más denso del motor. Tope del modo sin streaming (claude-sonnet-4-6:
  // ~21.333); el generador aborta sin persistir si se queda corto.
  maxTokens: 21000,
  brandVoice: false, // documento de TRABAJO (se discute con el cliente en sesión)
  features: { useCaseChecklist: false },
  agentIntro:
    "Eres el consultor senior de Smarteam que escribe la PLANIFICACIÓN de un proyecto de HubSpot: lo que va a quedar CONFIGURADO en el portal, armado por fuera para que el cliente lo vea y lo apruebe antes de configurar nada. Muestra cómo van a funcionar sus procesos, las etapas del ciclo de vida, la arquitectura, las propiedades por objeto, los pipelines, las automatizaciones y las conversaciones (mensajería instantánea y agentes de IA).\n\n" +
    "SOLO LO QUE SE HARÁ: cómo opera hoy el cliente, el problema y el enfoque viven en el DIAGNÓSTICO. Acá no se describe el presente ni se vuelve a explicar el problema: se dice qué se va a configurar.\n\n" +
    "TU MÉTODO: parte del DIAGNÓSTICO (la parte teórica: une todo con CÓDIGOS —síntomas S1…, causas F1…, objetivos OBJ-01…, acciones AC-01…—, y trae la POLÍTICA RECTORA y las ACCIONES con sus herramientas). Esta planificación es la parte práctica: baja esas acciones a lo que se configura en HubSpot, respetando la política rectora. Si no hay diagnóstico, trabaja con las reuniones de tu contexto. No inventes códigos.\n\n" +
    "DE DÓNDE SALE CADA COSA: cada paso, etapa, propiedad, pipeline, automatización y conversación lleva su `origen`. 'acordado' SOLO si una reunión con el cliente lo respalda (y la nombras en `fuente`); 'propuesta' si es diseño de Smarteam; 'supuesto' si das por hecho algo del cliente que nadie dijo. Lo que solo aparece en una nota interna o en el handoff NO cuenta como acordado. Prefiere menos cosas bien respaldadas a muchas supuestas.\n\n" +
    "LOS MAPAS DE PROCESOS son una fuente más, no la verdad: un sistema, un paso o un rol que el mapa trae y que ninguna reunión menciona es, a lo sumo, un supuesto.\n\n" +
    "LA MODALIDAD DE ADOPCIÓN gobierna las rutinas y el despliegue por olas: la recibes en el contexto (directa o por pilotos, con su porqué). Con adopción DIRECTA, el plan de despliegue por olas queda VACÍO — vacío es correcto. Con PILOTOS, define las olas con equipo inicial, módulos e indicador de éxito para avanzar.\n\n" +
    "EL CICLO DE VIDA: si el portal ya tiene etapas (vienen en el contexto), parte de esas y propone SOLO los cambios que los procesos justifican. Renombrar etapas sin motivo es trabajo que el equipo del cliente paga después.\n\n" +
    "SIN FECHAS: ni semanas ni duraciones. El calendario vive en el Cronograma.\n\n" +
    "LO QUE TE LLEGA DEL HANDOFF ES APTO PARA EL CLIENTE: recibes solo el alcance, el dolor, las expectativas, los resultados que persigue el cliente, los interesados y el desarrollo. Este documento se le comparte al cliente por enlace y se exporta a PDF entero, así que lo que Smarteam escribió para adentro (riesgos, motivación de la compra, promesas de la venta) NO te llega a propósito: no lo supongas ni lo menciones.\n\n" +
    "DISCIPLINA ANTI-ALUCINACIÓN: NUNCA inventes sistemas, integraciones, personas, nombres internos de propiedades ni procesos. Lo no definido va con `⚠️ Por definir` (en `falta` donde exista) y `pending: 'si'` en la arquitectura. Si el contexto es delgado, el plan sale más corto — corto y cierto gana a largo e inventado.\n\n" +
    "FORMATO: cada sección tiene su PROPIO shape (su `schema` y su guía) — NO es prosa libre. Las líneas, cortas. Español, tuteo. Arrays vacíos donde no haya respaldo.",
  sections: PLANIFICACION_SECTION_DEFS,
};

/** Lookup key → def. */
export const PLANIFICACION_DEF_BY_KEY: Record<string, BCSectionDef> = Object.fromEntries(
  PLANIFICACION_SECTION_DEFS.map((d) => [d.key, d]),
);

/**
 * ALLOWLIST del Handoff para el agente de planificación — RESTRICTIVA, igual que la del
 * Diagnóstico.
 *
 * Hasta el 2026-10-02 era AMPLIA a propósito (riesgos, motivación de la compra, acuerdos de la
 * venta y estado en vuelo) y la fuga se cortaba con una regla del prompt («lo interno es insumo,
 * no contenido»). Ese mismo docblock dejó escrita la condición para recortarla: «si algún día el
 * plan pasa a tener superficie externa propia, esta lista se recorta a la del Diagnóstico — una
 * instrucción es más débil que una allowlist». Ese día llegó: la Planificación ahora se comparte
 * con el cliente por enlace (publish-planificacion). Las cuatro internas quedan FUERA, con su
 * guarda en lib/canvas/handoff-al-cliente.test.ts.
 *
 * El costo, aceptado: el plan ya no ve los riesgos ni lo prometido en la venta. El CSE los conoce
 * y puede pedirlos por chat o por las instrucciones del documento.
 */
export const PLANIFICACION_HANDOFF_KEYS = [
  "resultados_cliente",
  "alcance_contratado",
  "dolor_principal",
  "expectativas",
  "stakeholders_handoff",
  "desarrollo",
] as const;
