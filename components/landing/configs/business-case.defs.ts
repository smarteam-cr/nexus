/**
 * components/landing/configs/business-case.defs.ts
 *
 * Metadatos de las secciones del Business Case SIN componentes (server-safe): key,
 * label, eyebrow, theme, JSON Schema (para el agente), agentHint, `brief` (la guía
 * del spec — editable en el editor, leída por el agente) y `empty`. Se separa de
 * business-case.ts (que ata los componentes client) para que el agente —código
 * server— pueda importar solo esto sin arrastrar React.
 *
 * Estructura HubSpot-específica del spec de 9 secciones. Estas defs son las
 * `sections` del template "hubspot_v1" en BC_TEMPLATES (configs/templates.defs.ts) —
 * el registry es la fuente de composición; BC_SECTION_DEFS/BC_DEF_BY_KEY se mantienen
 * exportados por compatibilidad.
 */
import type { CompararLabels, InvestLabels, LandingContext } from "../types";

export interface BCSectionDef {
  key: string;
  label: string;       // título grande de la sección (no-selfTitled)
  eyebrow?: string;    // categoría chica arriba del título
  tip?: string;        // ⓘ junto al título: explicación en hover (tooltip CSS-only). Roles lo usa.
  theme: "dark" | "light" | "soft";
  backdrop?: boolean;
  selfTitled?: boolean;
  schema: Record<string, unknown>;
  agentHint: string;   // instrucción base (fallback); el `brief` la gana
  brief: string;       // guía del spec (descripción + regla "Fuente:") — editable + leída por el agente
  empty: unknown;
  /** Rótulo INTERNO de la fila CanvasSection (y del snapshot). Ausente = `label`.
   *  Histórico: los 9 de hubspot usan los rótulos cortos de BUSINESS_CASE_CANVAS. */
  canvasLabel?: string;
  /** Id del renderer en SECTION_COMPONENTS (configs/templates.ts). Ausente = la key.
   *  Permite que templates distintos reusen un mismo componente con keys propias. */
  sectionType?: string;
  /** Rótulos de los CHIPS de columna de `web_diagnosis`, por documento.
   *  Ausente = los literales históricos del componente ("Retos actuales" / "Por qué
   *  {plataforma}"), que son los correctos en la propuesta de sitio web. Existe porque ese
   *  componente lo comparten cuatro documentos y en tres de ellos las columnas ya no son
   *  "retos" ni un "por qué" de una plataforma. Ver `SectionProps.sectionChips`. */
  chips?: { retos?: string; panel?: string };
  /** Rótulos de los bloques de la sección de INVERSIÓN, por documento. Hermano de `chips`
   *  —el rótulo entra por la DEFINICIÓN, nunca por un campo de `data`— con los valores
   *  tipados contra i18n para que un template nuevo no pueda quedar monolingüe.
   *  Ver `SectionProps.sectionInvest`. */
  invest?: InvestLabels;
  /** Rótulos de las DOS columnas de `process_mapping`, por documento. Hermano de `invest`
   *  (claves de i18n, no literales). Ausente = "Hoy" / "Con la implementación", que es lo
   *  correcto en los cuatro documentos que miran hacia adelante. La Entrega mira hacia
   *  atrás y usa "Antes" / "Ahora". Ver `SectionProps.sectionCompara`. */
  compara?: CompararLabels;
  /** La sección nace OCULTA: createBusinessCaseCanvas siembra `hidden:true` en el Json
   *  del canvas (publish filtra por ese Json, no por la config). El CSE la muestra cuando aplica. */
  defaultHidden?: boolean;
  /** false = el agente NO genera esta sección (se llena determinísticamente o a mano);
   *  generateCanvasSections la saltea y blocks/regenerate la rechaza. */
  agentGenerated?: boolean;
  /** (kickoff) la sección se alimenta de ctx, no de data → no se omite por isBlank en read. */
  ctxDriven?: boolean;
  /** (kickoff) solo `ctxDriven`: true si no hay NADA que renderizar (el Component daría null).
   *  El motor lo consulta antes de pintar el chrome de edición. Función PURA — no rompe
   *  el server-safe de este archivo (no toca React ni el DOM). */
  ctxEmpty?: (ctx: LandingContext) => boolean;
  /** (kickoff) posición fija: no participa del drag&drop de reordenar. */
  pinned?: boolean;
  /** (kickoff) no se puede ocultar (sin toggle de ojo): hero y cierre. */
  noHide?: boolean;
}

const str = { type: "string" } as const;
const strArray = { type: "array", items: { type: "string" } } as const;
function arrayOf(props: Record<string, unknown>, required: string[]) {
  return { type: "array", items: { type: "object", properties: props, required } } as const;
}

export const BC_SECTION_DEFS: BCSectionDef[] = [
  {
    key: "hero",
    canvasLabel: "Encabezado",
    label: "Cabecera de la propuesta",
    theme: "dark",
    backdrop: true,
    selfTitled: true,
    empty: { headline: "", subhead: "", tags: [], brands: [] },
    agentHint: "Encabezado del caso (titular + subtítulo + tags de hubs/integración/diferenciador).",
    brief:
      "Cabecera del business case (dark, con logos cliente × Smarteam × HubSpot). `headline`: '[Verbo de transformación] la [operación/experiencia/proceso] de [Nombre cliente]'. `subhead`: una frase que resume el dolor central y la apuesta. `tags`: 3 a 4 chips (hubs involucrados + integración clave + elemento diferenciador). Fuente: extraé del transcript el nombre del cliente, su industria, los hubs discutidos y la frase del dolor principal.",
    schema: { type: "object", properties: { headline: str, subhead: str, tags: strArray }, required: ["headline", "subhead"] },
  },
  {
    key: "dolores",
    canvasLabel: "Dolores y retos",
    label: "Puntos de dolor",
    eyebrow: "Diagnóstico",
    theme: "light",
    empty: { items: [] },
    agentHint: "3 a 6 dolores concretos del cliente, con su lenguaje. UNA línea cada uno.",
    /* ESCUETO por pedido de Elías (2026-08-04): la propuesta se presenta EN PANTALLA, en vivo, y
       las cards salían con párrafos de 4-5 líneas que nadie lee proyectado. El brief anterior ya
       pedía "1-2 líneas" y no alcanzó — sin un tope en PALABRAS el modelo se estira igual. */
    brief:
      "Los puntos de dolor reales: 3 a 6 problemas específicos del cliente tal como surgieron en la conversación. No genéricos — con el lenguaje del prospecto.\n\nESCUETO, se presenta proyectado: `title` de 3 a 7 palabras, sin punto final (ej. 'Todo opera en Excel', 'Sin visibilidad del pipeline'). `detail` de UNA sola frase, MÁXIMO 25 palabras — el dolor y su consecuencia, nada más.\n\nCUANTIFICÁ EL DOLOR cuando las fuentes lo permitan, y buscalo activamente: barré el transcript, las notas internas y el timeline de HubSpot buscando volumen, porcentajes, tiempo y dinero de ESTE cliente. Podés multiplicar factores que estén en las fuentes y la cuenta va escrita ('el 15% de 2.000 leads al mes, a un ticket de $2.000, son unos $360.000 al año'), con la fuente si la sabés ('según Ronald'). Si el número no está o falta un factor, el dolor va SIN cifra — jamás la inventes. Es plata del CLIENTE: el precio de la propuesta nunca va acá.\n\nTRES REGLAS DURAS de la cuantificación, y las tres se rompen solas si no las mirás al escribir cada tarjeta:\n1. UN PROBLEMA = UNA TARJETA. La cifra va DENTRO de la tarjeta del problema que cuantifica. Prohibido abrir una tarjeta para alojar el número y prohibido que dos tarjetas hablen del mismo problema (una el síntoma, otra su costo): es el mismo dolor contado dos veces.\n2. EL `title` NUNCA ES UN NÚMERO. Ni empieza con uno, ni es un porcentaje, ni es un monto. El título nombra el problema en 3-7 palabras ('Leads asignados a mano en Excel'); la cifra vive en el `detail`. Un título como 'Entre el 15% y el 20% de leads sin contacto' o '$35.000 perdidos cada mes' reemplazó el dolor en vez de sumarle.\n3. La cifra va al FINAL del `detail`, que sube a 35 palabras como TOPE DURO cuando la lleva — es una tarjeta angosta, cuatro en fila: comprimí la cuenta y no repitas la fuente si la frase ya la nombró.\n\nPROHIBIDO: más de una frase por `detail`, contexto de fondo, justificar por qué importa, repetir el título con otras palabras. Si dudás entre incluir o recortar, recortá.\n\nFuente: quejas explícitas en el transcript — 'manual', 'no tenemos visibilidad', 'perdemos tiempo en', 'el equipo no sabe'.",
    schema: { type: "object", properties: { items: arrayOf({ title: str, detail: str }, ["title", "detail"]) }, required: ["items"] },
  },
  {
    key: "antes_despues",
    canvasLabel: "Antes y después",
    label: "Antes vs. después",
    eyebrow: "Qué cambia",
    theme: "soft",
    empty: { before: [], after: [] },
    agentHint: "Contraste directo Hoy vs Con HubSpot + Smarteam (dos listas, máx. 4 por lado).",
    /* ESCUETO por el mismo motivo que `dolores` (pedido de Elías, 2026-08-13): la sección se
       proyecta en la reunión y salía con 7-8 puntos de dos líneas por columna. El texto subió a
       16px en el motor, así que el tope de bullets NO es cosmético — sin él la caja crece y las
       dos columnas dejan de leerse en paralelo. */
    brief:
      "Antes vs. después: contraste directo entre el estado actual (`before` = 'Hoy') y el estado objetivo (`after` = 'Con HubSpot + Smarteam').\n\nESCUETO, se presenta proyectado: **MÁXIMO 4 puntos por columna** (3 si el transcript no da para más) y **MÁXIMO 14 palabras cada uno**, de una sola línea y sin punto final. Las dos listas tienen la MISMA cantidad de puntos y el de 'después' responde al de 'antes' que está en su misma posición.\n\nPROHIBIDO: encadenar dos ideas con 'y' o con una coma para meter más contenido en un punto, repetir con otras palabras algo que ya dice otro punto, enumerar herramientas por enumerar. Si sobran temas, quedate con los que más duelen — de eso se trata elegir 4.\n\nConcreto, no aspiracional. Fuente: del transcript; sin prometer lo que no se discutió.",
    schema: { type: "object", properties: { before: strArray, after: strArray }, required: ["before", "after"] },
  },
  {
    key: "solucion",
    canvasLabel: "Solución propuesta",
    label: "Qué se implementa",
    eyebrow: "Solución propuesta",
    theme: "light",
    // `empty` NO declara `activos`: un default de presentación acá volvería la sección
    // permanentemente no-vacía y haría mentir al botón "Limpiar" (la trampa que ya
    // mordió con `anchoRecurrente`, `logoScale` y `__lang` — ver lib/landing/is-blank.ts).
    empty: { intro: "", columnas: [] },
    agentHint: "Una columna por CADA Hub de HubSpot (los vendidos primero), con lo que se implementa adentro.",
    brief:
      "Qué se implementa, UNA COLUMNA POR CADA UNO de los seis Hubs de HubSpot — no solo los vendidos. " +
      "Los VENDIDOS (los dice el preámbulo) van PRIMERO y se escriben como lo que se va a implementar; " +
      "los demás van después y se escriben como lo que ese Hub SUMARÍA, en condicional: el cliente los ve " +
      "marcados «No incluido» y puede abrirlos para explorar, así que nunca los presentes como parte del " +
      "alcance ni les pongas precio. " +
      "`hub`: el slug exacto (`marketing_hub`, `sales_hub`, `service_hub`, `content_hub`, `data_hub`, `revenue_hub`); si algo vendido no es un Hub (Breeze, un agente a la medida), escribí su nombre tal cual y va con color neutro. " +
      "`titulo` de la columna: qué resuelve ESE Hub en este negocio, en 4-6 palabras y en el lenguaje del cliente — no el nombre del producto otra vez. " +
      "`items`: 3 a 5 tarjetas de lo que se implementa ahí. `titulo` corto (qué se pone a funcionar) y `detalle` de una línea (qué cambia para el cliente cuando funciona). " +
      "`canales`: solo si la tarjeta aterriza en canales concretos, separados por coma (\"LinkedIn, Meta, correo\"); si no aplica, vacío — un pipeline de ventas no tiene canal. " +
      "`intro`: una frase que conecte las columnas con lo que el cliente dijo que le duele. " +
      "Fuente / regla: el material de la base de conocimiento es GENÉRICO — traducilo a la industria y a lo que se dijo en las fuentes. Una capacidad que el contexto no respalda NO se escribe: una propuesta con promesas que nadie pidió se cae en la primera reunión.",
    schema: {
      type: "object",
      properties: {
        intro: str,
        columnas: arrayOf(
          {
            hub: str,
            titulo: str,
            items: arrayOf({ titulo: str, detalle: str, canales: str }, ["titulo"]),
          },
          ["hub", "titulo", "items"],
        ),
      },
      required: ["columnas"],
    },
  },
  {
    key: "roi",
    canvasLabel: "Impacto y ROI",
    label: "Números que respaldan la decisión",
    eyebrow: "Impacto / ROI",
    theme: "dark",
    empty: { metrics: [] },
    agentHint: "4 métricas con base en las fuentes (value + label), al menos una en dinero si el dato existe.",
    brief:
      "ROI / impacto financiero: hasta 4 métricas que respaldan la decisión, sacadas de las fuentes (transcript, notas internas, timeline de HubSpot). Dos clases, y hacen falta las dos: OPERATIVAS (volumen, usuarios, tiempo de ciclo, retraso de reportes) y ECONÓMICAS (lo que esa operación cuesta o deja de ganar en plata). Al menos UNA económica si el contexto da para calcularla — es la que hace que la propuesta pese; si no da, ninguna inventada.\n\nSon TARJETAS de un número grande, cuatro en fila: `value` es el número solo ('$360.000–480.000', '4 horas', '15%') y `label` es UNA sola frase de MÁXIMO 20 palabras que dice qué es ese número y de dónde salió. Ej.: '$48.000' + 'perdidos en garantías mal gestionadas en 2026, según su cierre contable'.\n\nLa cifra económica puede DERIVARSE multiplicando factores que estén en las fuentes, y entonces el `label` lleva la cuenta comprimida ('15–20% de 2.000 leads mensuales a un ticket de $2.000, según Mariana'). Si falta un factor, no se estima.\n\nPROHIBIDO: una segunda frase que argumente por qué el número importa o que lo compare contra lo que cuesta el proyecto — el número habla solo y la tarjeta es angosta. NUNCA inventes cifras ni traigas promedios de industria: sin sustento, la métrica se omite. Es plata del CLIENTE — el precio de la propuesta no va acá, va en Inversión.",
    schema: { type: "object", properties: { metrics: arrayOf({ value: str, label: str }, ["value", "label"]) }, required: ["metrics"] },
  },
  {
    key: "cronograma",
    canvasLabel: "Plan de implementación",
    label: "Cómo trabajamos",
    eyebrow: "Timeline",
    theme: "light",
    empty: { phases: [] },
    agentHint: "3 a 5 fases con semanas según complejidad.",
    /* `semanas` existe para que el Gantt no dependa de leer prosa: es el MISMO rango que
       `duration`, en formato de máquina. Se pide explícito porque `duration` es texto libre y
       ya hay una propuesta publicada que dice "Mes 4", que no se puede ubicar en un eje de
       semanas — ver lib/landing/plan-weeks.ts. */
    brief:
      "Plan de implementación en fases reales del proyecto, con semanas aproximadas según complejidad. Fases típicas: Kickoff y discovery, Implementación [hubs del caso], Piloto con usuarios clave, Go live y optimización. Fuente / regla: las semanas se infieren del número de hubs, integraciones y usuarios; integración ERP → sumar 4 semanas mínimo.\n\nCADA FASE LLEVA EL MISMO RANGO DOS VECES: `duration` es lo que LEE el cliente ('Semanas 1-2', 'Semana 8') y `semanas` es ese mismo rango para la máquina, en formato estricto '1-2' (o '8' para una sola semana) — con eso se dibuja la línea de tiempo. Los dos SIEMPRE coinciden. Las semanas son ABSOLUTAS de inicio y fin, no duraciones: 'Semanas 6-10' va de la 6 a la 10. Dos fases pueden solaparse si corren en paralelo. NUNCA uses meses ('Mes 4') — no se pueden ubicar en la línea de tiempo.\n\nLa PRIMERA fase es la de diagnóstico y el documento le pone solo un aviso de que puede mover las fechas siguientes: no lo escribas vos en el texto de la fase.",
    schema: { type: "object", properties: { phases: arrayOf({ name: str, detail: str, duration: str, semanas: str }, ["name", "detail"]) }, required: ["phases"] },
  },
  {
    key: "inversion",
    canvasLabel: "Inversión",
    label: "Inversión",
    /* El eyebrow es la CATEGORÍA del argumento y el título es la sección: repetir la misma
       palabra en los dos (era «INVERSIÓN» sobre «Inversión») se lee como un error de armado.
       Lo congela `registry.test.ts`, que barre todas las defs no-`selfTitled`. */
    eyebrow: "Propuesta económica",
    theme: "soft",
    // `agentGenerated:false`: los montos los escribe VENTAS a mano. El agente los saltea,
    // la píldora ✨IA no se ofrece, regenerar responde 400 y el assist la excluye. Y el
    // carry-forward de `generate/route.ts` los arrastra a cada versión nueva — sin eso,
    // marcar la sección como curada haría que cada "Generar" borre lo escrito.
    agentGenerated: false,
    tip: "La escribe Ventas: el agente no toca los montos. El total se calcula solo.",
    empty: { moneda: "", lineas: [], licencias: [], extras: [], recurrentes: [], nota: "", anchoRecurrente: "normal" },
    // Sin `invest`: usa los rótulos genéricos ("Servicios Smarteam" / "Licencias y
    // plataforma"). Esta plantilla la comparten HubSpot, Integración, Desarrollo a la medida
    // e Insider, y no todas venden licencias de HubSpot.
    agentHint: "(No la genera el agente: los montos los escribe Ventas.)",
    brief:
      "Inversión — la escribe VENTAS a mano, el agente NO la genera. `lineas`: los servicios de Smarteam (implementación, integraciones, onboarding), una por concepto. `licencias`: lo que se le paga a un tercero (HubSpot, Insider…), aparte. En las dos, el `monto` es SOLO el número o el rango ('$1,800', '$5,600–6,650'): el sistema los suma y muestra los subtotales y el total general, así que un monto con texto adentro ('$1,800 por página', 'A definir') NO entra en la suma y aparece marcado como pendiente. Sin precio todavía → dejá el monto vacío. `extras` (opcionales) y `recurrentes` (mensuales) se muestran pero NO suman. Impuestos y condiciones van en `nota`.",
    schema: { type: "object", properties: {} },
  },
  {
    key: "partner",
    canvasLabel: "Sobre Smarteam",
    label: "Por qué Smarteam",
    eyebrow: "Partner",
    /* Banda oscura (2026-08-14): la sección pasó de cuatro tarjetas a una franja de landing
       con degradado navy y las insignias oficiales. El tema es lo que le da el fondo al motor
       — el degradado lo pinta el CSS de `.stl-partner`. */
    theme: "dark",
    /* `selfTitled`: la banda pinta su propio encabezado —la credencial como rótulo y el
       `titular` como titular—, que es lo que la vuelve una franja de landing y no una sección
       más con "Por qué Smarteam" arriba y un segundo titular abajo. Es seguro: de las 28
       secciones `partner` guardadas, NINGUNA tiene el título o el eyebrow renombrado, y el
       componente igual cae al rótulo del documento (`sectionTitle`) cuando no hay `titular`
       — que es el caso de las 4 propuestas ya publicadas. */
    selfTitled: true,
    empty: { credencial: "HubSpot Partner Elite", titular: "", resumen: "", referenciaSectorial: "" },
    agentHint: "Cierre: por qué Smarteam, mirando lo que este cliente necesita.",
    brief:
      "Por qué Smarteam — es el CIERRE del argumento, así que habla de la experiencia de Smarteam PUESTA AL SERVICIO de lo que este cliente pidió. `credencial`: exactamente «HubSpot Partner Elite» (fijo en todos los casos; no lo reformules). `titular`: UNA frase de cierre de 10 a 16 palabras y GRAMATICALMENTE COMPLETA — PROHIBIDO dejarla colgando en un verbo o una preposición para entrar en el tope («…en una operación que produce»); si la idea no entra, escribe una más corta. Conecta la experiencia acreditada de Smarteam con el resultado que este proyecto persigue — ej.: 'Experiencia acreditada para convertir arquitectura, integraciones y adopción en un plan gobernable'. Sin signos de admiración y sin superlativos vacíos ('los mejores', 'líderes'). `resumen`: 2 frases (máx. 45 palabras) que NOMBREN al cliente y digan con qué lo acompaña Smarteam y cuál es la prioridad de ESTE proyecto según su contexto — ej.: 'Smarteam acompaña a {cliente} con un equipo senior y credenciales oficiales de HubSpot. La prioridad es ejecutar con trazabilidad, transferencia de conocimiento y control del riesgo.'. `referenciaSectorial`: cliente de referencia en una industria similar al prospecto, si existe. Fuente: la credencial es fija; el titular y el resumen salen de lo que el cliente dijo que necesita (no inventes cifras, nombres de personas ni casos); la referencia, solo si hay evidencia.",
    schema: {
      type: "object",
      properties: { credencial: str, titular: str, resumen: str, referenciaSectorial: str },
      required: ["credencial", "titular", "resumen"],
    },
  },
  {
    key: "cta",
    canvasLabel: "Próximos pasos",
    label: "Llamado a la acción",
    theme: "dark",
    selfTitled: true,
    /* `buttonLabel` VACÍO a propósito: con un default, la sección nunca daba "en blanco"
       y el PDF imprimía un titular vacío, una bajada vacía y un botón sin destino. Peor:
       "Limpiar" escribe este mismo `empty` y le avisa al CSE que la sección quedó oculta
       — con el default, esa promesa era falsa. La lección ya estaba escrita en
       website.defs.ts y no había llegado hasta acá. */
    empty: { headline: "", subhead: "", buttonLabel: "" },
    agentHint: "Cierre corto + CTA.",
    brief:
      "Llamado a la acción (dark, cierre narrativo corto). `headline`: UNA PREGUNTA sobre el dolor principal del prospecto, con sus palabras (ej.: '¿Cuántas horas pierde tu equipo moviendo datos a mano?') — nunca una afirmación genérica. `subhead`: aterriza la pregunta en la apuesta del proyecto, honesta y sin venderte de más (fórmula de marca: 'Cuéntanos cómo opera tu equipo hoy y te decimos cuál es tu punto de partida — sin venderte de más.' adaptada a este caso). `buttonLabel`: 'Agendar siguiente paso'.",
    schema: { type: "object", properties: { headline: str, subhead: str, buttonLabel: str }, required: ["headline", "subhead", "buttonLabel"] },
  },
];

export const BC_DEF_BY_KEY: Record<string, BCSectionDef> = Object.fromEntries(
  BC_SECTION_DEFS.map((d) => [d.key, d]),
);
