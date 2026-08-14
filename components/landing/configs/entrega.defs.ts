/**
 * components/landing/configs/entrega.defs.ts
 *
 * Defs SERVER-SAFE del canvas "Entrega" — el documento con el que se CIERRA un proyecto.
 * Se le presenta y se le comparte al cliente, como el kickoff (paleta de MARCA).
 *
 * ── LA REGLA QUE GOBIERNA ESTE ARCHIVO ───────────────────────────────────────
 * **El agente no escribe ni un número.** Es el primer documento de Nexus de cara al cliente
 * cuyo contenido son cifras sobre su propio proyecto, y un número falso acá no es un bug: es
 * el papel que el cliente archiva y cita. Por eso `cumplimiento` y `pendientes` llevan
 * `agentGenerated: false` y las escribe el runner desde el cronograma — el agente ni las ve.
 * Un número inventado deja de ser posible POR CONSTRUCCIÓN, no por prompt.
 *
 * Las tres reglas, en orden:
 *   1. Las cifras las calcula el runner (`lib/delivery/claims.ts`), no el modelo.
 *   2. Sin dato, la sección se apaga sola vía `ctxEmpty`. Nunca «0%», nunca «null días».
 *   3. Un número que salió de una reunión no cruza al cliente sin que un humano lo acepte
 *      (ver `impacto` — `kpisPropuestos` vs `kpisConfirmados`).
 *
 * ── EL ORDEN, Y TAMPOCO ES ARBITRARIO ────────────────────────────────────────
 * Primero QUÉ se construyó (alcance, logros), después CÓMO se cumplió (el plan, el impacto)
 * y al final QUÉ FALTA (pendientes, continuidad). Al revés el documento arranca
 * justificándose, que es lo último que uno quiere leer en una entrega.
 *
 * ⚠ UNA KEY DE ESTE ARCHIVO NUNCA SE BORRA. `buildLandingConfigFromOrder` resuelve las keys
 * del documento contra las defs VIVAS: borrar una hace desaparecer esa sección de todos los
 * documentos ya entregados. Se deja de sembrar, pero la def queda — y las ramas legacy de
 * los componentes son obligatorias (patrón `HubsClienteSection`).
 */
import type { BCSectionDef } from "./business-case.defs";
import type { BcTemplateDef } from "./templates.defs";
import {
  PROCESS_MAPPING_SCHEMA_CON_TITULAR,
  PROCESS_MAPPING_EMPTY,
  ROI_SCHEMA,
  ROI_EMPTY,
} from "./shared-sections.defs";
import { ENTREGA_CIERRE_DEFAULT } from "@/lib/canvas/canvas-defs";
import { heroTitleBrief } from "@/lib/landing/hero-title";

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

export const ENTREGA_SECTION_DEFS: BCSectionDef[] = [
  {
    key: "portada",
    label: "Portada",
    eyebrow: "Entrega del proyecto",
    theme: "dark",
    backdrop: true,
    selfTitled: true,
    // Estructural: sin portada no hay documento que entregar. Elías pidió que las secciones
    // se puedan ocultar y mover — las SIETE del medio lo son; ésta y `cierre` no, porque
    // permitir publicar una entrega sin portada no es libertad, es un agujero.
    pinned: true,
    noHide: true,
    sectionType: "hero",
    agentGenerated: true,
    /* `brands` FUERA del schema del agente (como en todo el motor): los tres logos del
       co-branding. Los tokens `@client`/`@smarteam` se resuelven contra el ctx VIVO, así que
       un documento entregado hace meses muestra el logo actual y no uno congelado. */
    empty: { titulo: "", headline: "", subhead: "", tags: [], brands: ["@client", "HubSpot", "@smarteam"] },
    agentHint: "El titular de cierre. Tags = los Hubs y frentes que cubrió el proyecto.",
    brief:
      heroTitleBrief("Entrega del proyecto") +
      "Portada del documento de cierre. `headline`: la frase que resume QUÉ QUEDÓ FUNCIONANDO, en presente y desde el negocio del cliente " +
      "('HubSpot es hoy el motor comercial y de atención de <empresa>'), no desde el proyecto ('se implementó Sales Hub'). " +
      "`subhead`: 1-2 frases con el arco — de dónde salieron y dónde están hoy. " +
      "`tags`: los Hubs y frentes que cubrió ('Sales Hub', 'Service Hub', 'Migración'). " +
      "⚠ NO pongas fechas, plazos ni porcentajes acá: los números del proyecto los escribe Nexus en su propia sección.",
    schema: { type: "object", properties: { titulo: str, headline: str, subhead: str, tags: strArray }, required: ["headline"] },
  },
  {
    key: "resumen",
    label: "El antes y el después",
    eyebrow: "De dónde salieron y dónde están",
    theme: "light",
    sectionType: "process_mapping",
    agentGenerated: true,
    empty: PROCESS_MAPPING_EMPTY,
    agentHint: "Proceso por proceso: cómo trabajaban antes y cómo trabajan ahora.",
    /* El único documento que mira hacia atrás. Ver `CompararLabels`. */
    compara: {
      izquierda: "antes",
      derecha: "ahora",
      phIzquierda: "comoFuncionabaAntes",
      phDerecha: "comoFuncionaAhora",
    },
    brief:
      "El cambio concreto, proceso por proceso — es la sección que el cliente reconoce como propia. " +
      "`procesos[]`: `nombre` = el proceso en su vocabulario ('Seguimiento de cotizaciones', 'Atención de reclamos'); " +
      "`resumenHoy` = el ANTES en media línea, como titular ('Cada vendedor con su propia planilla'); " +
      "`comoEsHoy` = cómo lo hacían ANTES del proyecto (planillas, correos sueltos, la cabeza de alguien) — sacalo del handoff y de las primeras reuniones, no lo inventes; " +
      "`resumenSera` = el AHORA en media línea, como titular ('Un solo pipeline que todos ven'); " +
      "`comoSera` = cómo funciona AHORA, en presente y con lo que de verdad quedó construido; " +
      "⚠ Los dos `resumen*` son TITULARES, no resúmenes del párrafo: media línea que se lee sola y contrasta con la de enfrente. " +
      "`sistemas` = qué lo sostiene ('Sales Hub + workflow de recordatorios'). " +
      "Si el material no alcanza para describir el antes de un proceso, NO lo incluyas: media comparación es peor que ninguna.",
    schema: asSchema(PROCESS_MAPPING_SCHEMA_CON_TITULAR),
  },
  {
    key: "alcance",
    label: "Qué quedó implementado",
    eyebrow: "Lo que se construyó",
    theme: "light",
    sectionType: "hubs_cliente",
    agentGenerated: true,
    /* `activos` va FUERA del schema y en el primer nivel: es la curaduría del CSE sobre qué
       columnas quedan encendidas, y `preserveNonSchemaKeys` la acarrea entre regeneraciones. */
    empty: { intro: "", columnas: [] },
    agentHint: "Una columna por Hub, con lo que quedó realmente funcionando.",
    brief:
      "Qué quedó implementado, agrupado por Hub de HubSpot. `columnas[]`: una por Hub del alcance — `hub` = el slug del catálogo " +
      "('sales_hub', 'service_hub', 'marketing_hub', 'content_hub', 'data_hub', 'revenue_hub') o un nombre libre para lo que no es un Hub " +
      "(una integración, un desarrollo a medida); `titulo` = cómo lo llama el cliente; `items[]` = lo que quedó FUNCIONANDO, no lo que se planeó. " +
      "⚠ Solo lo que el cronograma o las reuniones confirmen como hecho. Si algo se planeó y no se construyó, va a «Qué queda abierto», no acá.",
    schema: {
      type: "object",
      properties: {
        intro: str,
        columnas: arrayOf({ hub: str, titulo: str, items: arrayOf({ title: str, detail: str }, ["title"]) }, ["hub", "titulo"]),
      },
      required: ["columnas"],
    },
  },
  {
    key: "logros",
    label: "Objetivos alcanzados",
    eyebrow: "Lo que el equipo puede hacer hoy",
    theme: "light",
    sectionType: "kickoff_prose",
    agentGenerated: true,
    empty: proseEmpty,
    agentHint: "Qué puede hacer el equipo del cliente hoy que antes no podía.",
    brief:
      "Resultados FUNCIONALES, escritos desde lo que el equipo del cliente puede hacer hoy y antes no. " +
      "`items[]`: `title` = la capacidad en una frase ('Toda conversación con un cliente queda registrada sola'); " +
      "`detail` = UNA línea de qué lo hace posible y qué cambia en el día a día. " +
      "⚠ Capacidades, no tareas: 'se configuraron 14 propiedades' es trabajo nuestro; 'el equipo ve el estado de cada negocio sin preguntar' es un logro del cliente. " +
      "Si un objetivo del handoff NO se alcanzó, no lo maquilles: omitilo acá y que aparezca en «Qué queda abierto».",
    schema: asSchema(proseSchema),
  },
  {
    key: "cumplimiento",
    label: "El plan, cumplido",
    eyebrow: "Cómo se cumplió el plan",
    theme: "light",
    sectionType: "roi",
    /* ⚠ NO LO ESCRIBE EL AGENTE — es la única promesa de honestidad del documento.
       Son números sobre el proyecto del cliente (fases cerradas, tareas hechas, semanas,
       cuánto se corrió el cierre) y los calcula el runner desde el cronograma. El agente ni
       ve esta sección, así que no puede inventar una cifra ni redondear una a su favor.
       Con `metrics: []` —sin ancla, sin baseline, sin nada que afirmar— `isBlank` la apaga
       sola en lectura y en PDF: preferimos no decir nada antes que decir «0%». */
    agentGenerated: false,
    empty: ROI_EMPTY,
    agentHint: "",
    brief:
      "Los números del cumplimiento del plan. Los escribe Nexus desde el cronograma — el agente no interviene y el CSE no los tipea.",
    schema: asSchema(ROI_SCHEMA),
  },
  {
    key: "impacto",
    label: "El impacto en el negocio",
    eyebrow: "Lo que nos contaron",
    theme: "soft",
    sectionType: "impacto_declarado",
    agentGenerated: true,
    /* DOS listas, y la separación ES el diseño:
       · `kpisPropuestos` — DENTRO del schema. El agente las extrae de lo que el cliente dijo
         en las reuniones. Regenerar las pisa, y está bien: es una propuesta.
       · `kpisConfirmados` — FUERA del schema, en el PRIMER nivel (hasta donde llega
         `preserveNonSchemaKeys`). Las escribe el CSE al aceptar una propuesta.
       La sección renderiza SOLO las confirmadas. Un número que salió de una transcripción no
       cruza al cliente sin que un humano lo mire — la misma doctrina que el cronograma
       («el agente propone, el CSE confirma»). */
    empty: { intro: "", kpisPropuestos: [], kpisConfirmados: [] },
    agentHint: "Números del negocio que el CLIENTE dijo en las reuniones, con la cita textual.",
    brief:
      "Números del negocio del cliente que APARECEN EN LAS REUNIONES: tiempos que bajaron, volumen que subió, tasas de cierre, cantidad de gente usando la herramienta. " +
      "`kpisPropuestos[]`: `label` = qué mide ('Tiempo de respuesta a un lead'); `valor` = como lo dijeron ('de 18 a 7 días', 'más del doble', '1.240'); " +
      "`cita` = la frase TEXTUAL de la reunión, sin parafrasear; `quien` = quién lo dijo, con su cargo si se sabe; `cuando` = la fecha de esa reunión. " +
      "⚠ Sin cita textual NO propongas el número. Y no calcules ni estimes nada: si nadie lo dijo, la lista va vacía — Nexus no mide el negocio del cliente y este documento no puede fingir que sí. " +
      "Estas propuestas NO se le muestran al cliente: las revisa el CSE y decide cuáles pasan.",
    schema: {
      type: "object",
      properties: {
        intro: str,
        kpisPropuestos: arrayOf({ label: str, valor: str, cita: str, quien: str, cuando: str }, ["label", "valor", "cita"]),
      },
      required: ["kpisPropuestos"],
    },
  },
  {
    key: "pendientes",
    label: "Qué queda abierto",
    eyebrow: "Lo que sigue en marcha",
    theme: "light",
    sectionType: "kickoff_prose",
    /* Tampoco la escribe el agente: sale de las tareas y fases que quedaron abiertas en el
       cronograma, con su responsable. Decisión de Elías: un proyecto se entrega con
       pendientes y se listan — es lo que hace útil el documento en la reunión de cierre. */
    agentGenerated: false,
    empty: proseEmpty,
    agentHint: "",
    brief: "Lo que quedó abierto, derivado del cronograma. Lo escribe Nexus, no la IA.",
    schema: asSchema(proseSchema),
  },
  {
    key: "continuidad",
    label: "El siguiente proyecto",
    eyebrow: "Hasta dónde llegamos, y qué viene",
    theme: "light",
    sectionType: "kickoff_prose",
    agentGenerated: true,
    empty: proseEmpty,
    agentHint: "El próximo proyecto que tendría sentido, con el problema que resuelve.",
    brief:
      "⚠ ESTE PROYECTO YA TERMINÓ. Escribí en PASADO sobre lo entregado y en FUTURO solo sobre lo que vendría después; " +
      "nada de «vamos a acompañarlos durante la implementación», que ya ocurrió. " +
      "Esta sección es la PROPUESTA DEL PRÓXIMO PROYECTO: qué construir ahora que esto quedó en pie. " +
      "`items[]`: 2 a 4, no más — una lista larga se lee como catálogo y no como recomendación. " +
      "`title` = el proyecto en 4-6 palabras y en el idioma del cliente ('Automatizar la cotización', no 'Fase 2 de Sales Hub'). " +
      "`detail` = UNA o DOS líneas: qué problema del cliente resuelve y por qué AHORA es el momento — anclado en algo que dijeron ellos en las reuniones. " +
      "Ordenalos por lo que HOY les duele, no por lo que sería lindo vender: el primero tiene que ser el que ellos mismos nombraron más veces. " +
      "⚠ Si el material no respalda ninguna oportunidad concreta, devolvé `items: []` — una propuesta inventada en un documento de cierre quema la confianza que el proyecto acaba de ganar.",
    schema: asSchema(proseSchema),
  },
  {
    key: "recomendaciones",
    label: "Cómo sacarle más provecho",
    eyebrow: "Sin contratar nada",
    theme: "light",
    sectionType: "kickoff_prose",
    agentGenerated: true,
    empty: proseEmpty,
    /* La contracara de `continuidad`: existe para el cliente que NO quiere un proyecto nuevo.
       Sin esta sección el documento termina en una venta, y un cierre que solo vende se lee
       como una venta. Acá el consejo es gratis y no depende de que nos contraten. */
    agentHint: "Qué puede hacer el equipo del cliente, por su cuenta, para exprimir lo implementado.",
    brief:
      "Recomendaciones que el equipo del cliente puede aplicar SOLO, sin contratarnos nada — es la contracara de la sección anterior. " +
      "`items[]`: 3 a 5. `title` = la acción en imperativo y corta ('Revisar el pipeline una vez por semana'). " +
      "`detail` = UNA o DOS líneas: por qué mueve la aguja y quién de su equipo debería hacerlo. " +
      "Buenas fuentes: hábitos que se les caen cuando nadie mira, funcionalidad ya configurada que todavía no usan, " +
      "datos que ya tienen y no están mirando, y lo que el propio equipo dijo que le costaba en las reuniones. " +
      "⚠ Cero venta acá: si la recomendación necesita que hagamos algo nosotros, va en la sección anterior, no en ésta. " +
      "⚠ Nada genérico tipo «capacitar al equipo»: si no podés decir sobre QUÉ y para resolver qué, dejalo afuera.",
    schema: asSchema(proseSchema),
  },
  {
    key: "cierre",
    label: "Cierre",
    eyebrow: "Gracias",
    theme: "dark",
    selfTitled: true,
    pinned: true,
    noHide: true,
    ctxDriven: true,
    sectionType: "entrega_cta",
    agentGenerated: false, // CURADA
    empty: ENTREGA_CIERRE_DEFAULT,
    agentHint: "",
    brief: "Cierre curado: el agradecimiento y el canal que queda abierto. Botón opcional (agenda, soporte, grupo).",
    schema: {
      type: "object",
      properties: { eyebrow: str, headline: str, subhead: str, buttonLabel: str, buttonUrl: str, buttonTarget: str },
    },
  },
];

/** Template del canvas Entrega para el agente tipado. */
export const ENTREGA_TEMPLATE: BcTemplateDef = {
  id: "entrega_v1",
  caseLabel: "Entrega",
  maxTokens: 16000,
  brandVoice: true, // se le comparte al CLIENTE
  features: { useCaseChecklist: false },
  agentIntro:
    "Eres quien escribe el DOCUMENTO DE ENTREGA con el que Smarteam cierra un proyecto con su cliente. Lo lee el sponsor y su equipo — la gente que pagó y que va a decidir si sigue.\n\n" +
    "QUÉ ES ESTE DOCUMENTO: el cierre que el cliente archiva. Cuenta de dónde salieron, qué quedó funcionando, qué pueden hacer hoy que antes no podían, y qué sigue. No es un informe de horas ni una lista de tareas nuestras.\n\n" +
    "⚠ NO ESCRIBES NÚMEROS DEL PROYECTO. Las cifras de cumplimiento —fases cerradas, tareas hechas, semanas, fechas de cierre, atrasos— las calcula Nexus del cronograma y las escribe en su propia sección. Vos no las menciones en ninguna parte: ni en la portada, ni en los logros, ni en el resumen. Si necesitás hablar de tiempo, hacelo en cualitativo ('durante el proyecto', 'desde el arranque'), nunca con una cifra.\n\n" +
    "LA ÚNICA EXCEPCIÓN son los números del NEGOCIO DEL CLIENTE en la sección de impacto, y solo si alguien los DIJO en una reunión: van con su cita textual, y quedan como propuesta para que el CSE los revise. Si nadie dijo un número, la lista va vacía. Nexus no mide el negocio del cliente y este documento no puede fingir que sí.\n\n" +
    "TU MÉTODO: el arco sale del HANDOFF (qué se vendió y qué dolía) y de las SESIONES (qué pasó de verdad). Lo que quedó construido sale del cronograma y de los documentos del proyecto. Escribí desde el negocio del cliente, no desde nuestro trabajo: 'el equipo ve el estado de cada negocio sin preguntar', no 'se configuraron 14 propiedades'.\n\n" +
    "DISCIPLINA ANTI-MAQUILLAJE: si un objetivo del handoff no se alcanzó, NO lo escribas como alcanzado ni lo suavices — omitilo y dejá que aparezca en la sección de pendientes, que la escribe Nexus. Un documento de cierre que solo cuenta lo bueno se lee como folleto y el cliente lo nota en la primera línea que no le cierra.\n\n" +
    "FORMATO: cada sección tiene su propio shape (su `schema` y su guía). Español, tuteo al cliente. Arrays vacíos donde no haya respaldo — una sección vacía se apaga sola, y eso es correcto.",
  sections: ENTREGA_SECTION_DEFS,
};

/** Lookup key → def. */
export const ENTREGA_DEF_BY_KEY: Record<string, BCSectionDef> = Object.fromEntries(
  ENTREGA_SECTION_DEFS.map((d) => [d.key, d]),
);
