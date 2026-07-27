/**
 * components/landing/configs/exploracion.defs.ts
 *
 * Defs SERVER-SAFE (sin React) del canvas "Exploración" — la GUÍA DE DESCUBRIMIENTO que
 * usa el CSE cuando el kickoff ya pasó y hay que entender el negocio del cliente. Corre
 * sobre el mismo motor `LandingView` que el Kickoff y el Desarrollo.
 *
 * DOCUMENTO INTERNO: el cliente NO lo ve nunca. No existe `/external/exploracion` ni
 * `publish-exploracion` — la ausencia de ese camino la congela
 * `lib/canvas/exploracion-internal.test.ts`. Además se renderiza con la PALETA INTERNA
 * (`.stl-internal`: grises y blancos, ámbar solo para lo no verificado) para que se
 * distinga a simple vista de lo que sí ve el cliente.
 *
 * DISEÑO (máximo reuso de renderers, igual que Desarrollo): de las 6 secciones de
 * contenido, 5 se rinden con renderers YA existentes del motor —
 *  - `ya_sabemos` · `personas` · `profundidad` → `pain` (grid de tarjetas)
 *  - `sin_verificar` → `web_diagnosis` (supuestos + panel oscuro de consecuencias)
 * y solo el PLAN DE SESIONES tiene componente propio (`exploracion_sesiones`), porque su
 * shape —sesión con orden, objetivo, participantes y preguntas— no lo cubre ninguno.
 *
 * EL EJE DEL DOCUMENTO: separar lo que YA SE SABE (para no repreguntarlo) de lo que se
 * DIO POR SUPUESTO y nadie verificó. De ese segundo grupo salen las preguntas.
 */
import type { BCSectionDef } from "./business-case.defs";
import type { BcTemplateDef } from "./templates.defs";
import { WEB_DIAGNOSIS_SCHEMA, WEB_DIAGNOSIS_EMPTY, PAIN_SCHEMA, PAIN_EMPTY } from "./shared-sections.defs";
// Fuente única del default del cierre (canvas-defs.ts, sin dependencias — seguro para
// server y cliente): evita que este `empty` derive del literal sembrado y quede
// desincronizado.
import { EXPLORACION_CIERRE_DEFAULT } from "@/lib/canvas/canvas-defs";
import { heroTitleBrief } from "@/lib/landing/hero-title";

const str = { type: "string" } as const;
const strArray = { type: "array", items: { type: "string" } } as const;
const asSchema = (s: unknown) => s as unknown as Record<string, unknown>;
function arrayOf(props: Record<string, unknown>, required: string[]) {
  return { type: "array", items: { type: "object", properties: props, required } } as const;
}

export const EXPLORACION_SECTION_DEFS: BCSectionDef[] = [
  {
    key: "exploracion",
    label: "Qué hay que entender de este proyecto",
    eyebrow: "Exploración del negocio",
    theme: "dark",
    backdrop: true,
    selfTitled: true,
    pinned: true,
    noHide: true,
    sectionType: "exploracion_hero",
    agentGenerated: true,
    empty: { titulo: "", headline: "", subhead: "", tags: [] },
    agentHint:
      "Qué hay que entender de ESTE negocio para entregar bien + la calibración que usaste (cliente grande vs. chico) + chips de los frentes a explorar.",
    brief:
      heroTitleBrief("Exploración del negocio") +
      "Portada de la guía. `headline`: en UNA línea, qué es lo que hay que entender del negocio del cliente para entregar bien ESTE proyecto (no el nombre del proyecto — el foco de la exploración). " +
      "`subhead`: 1-2 frases que declaran EXPLÍCITAMENTE la calibración que usaste y por qué, para que el CSE la corrija si te equivocaste. Ej.: 'Cliente con operación grande y equipo propio de datos: la guía apunta a los puntos ciegos, no a mapear lo que ya saben.' o 'Cliente chico, sin proceso formal: la guía sí mapea lo básico porque probablemente no esté escrito en ningún lado.' " +
      "`tags`: 2-5 chips cortos de los frentes a explorar (ej. 'Proceso comercial', 'Datos', 'Postventa', 'Facturación'). No inventes frentes que la fuente no mencione.",
    schema: { type: "object", properties: { titulo: str, headline: str, subhead: str, tags: strArray }, required: ["headline"] },
  },
  {
    key: "ya_sabemos",
    label: "Lo que ya sabemos",
    eyebrow: "No lo repreguntes",
    theme: "light",
    sectionType: "pain",
    agentGenerated: true,
    empty: PAIN_EMPTY,
    agentHint:
      "Hechos CONFIRMADOS por la fuente, cada uno con de dónde salió. Es la lista de lo que NO hay que volver a preguntar.",
    brief:
      "Lo que el handoff y los documentos del proyecto YA contestaron — existe para que el CSE no queme una sesión repreguntando lo que el cliente ya dijo. Cada `item`: `title` = el hecho en 5-10 palabras, afirmado ('Facturan en Odoo, no en HubSpot'); `detail` = UNA línea con DE DÓNDE salió, para que el CSE pueda contrastarlo ('Handoff · ¿Qué vendimos?' / 'Business case · dolores' / 'Cronograma · fase 2'). " +
      "REGLA DURA: acá va SOLO lo que está afirmado explícitamente en la fuente. Si algo suena razonable pero nadie lo dijo, NO va acá — va en «Lo que damos por supuesto». Confundir las dos secciones es el peor error posible de este documento: haría que el CSE dé por cerrado algo que nadie confirmó. Si la fuente es delgada, esta sección puede tener pocos ítems — eso es correcto y además es informativo.",
    schema: asSchema(PAIN_SCHEMA),
  },
  {
    key: "sin_verificar",
    label: "Lo que damos por supuesto",
    eyebrow: "Nadie lo confirmó todavía",
    theme: "light",
    sectionType: "web_diagnosis",
    agentGenerated: true,
    empty: WEB_DIAGNOSIS_EMPTY,
    agentHint:
      "Los supuestos NO verificados (izq) + los riesgos si alguno es falso (panel oscuro) + qué hay que confirmar primero. El corazón del documento.",
    /* Los rótulos de las dos columnas. Sin esto, el componente —que nació para la propuesta
       de sitio web— rotulaba la izquierda "Retos actuales" sobre una lista de supuestos, y
       la derecha "Por qué " + lo que el brief le hacía escribir al agente, que producía
       "Por qué qué se rompe si el supuesto es falso".
       "Riesgos" y no "Qué se rompe" (decisión del usuario, 2026-07-27): "se rompe" se lee
       como si se rompiera el SUPUESTO, cuando lo que se rompe es la entrega. */
    chips: { retos: "Supuestos", panel: "Riesgos" },
    /* ── EL LARGO SE MIDE EN PALABRAS, NO EN "UNA LÍNEA" ──────────────────────────────
       La versión anterior ya pedía `detail` de "UNA línea". Sobre el único documento
       generado, se incumplió 16 de 16 veces: los detalles promediaban 193 caracteres, que
       son 3 líneas renderizadas. "Una línea" no es medible desde el lado del modelo — no
       sabe cuánto mide la caja. Los topes de acá son números que sí puede contar. */
    brief:
      "EL CORAZÓN DE LA GUÍA, y va ESCUETO: los supuestos que se dieron por ciertos y que nadie verificó — de acá salen las preguntas del plan de sesiones. Se lee de un vistazo antes de una reunión, no se estudia. Tarjetas a la izquierda + un panel oscuro de consecuencias a la derecha + un objetivo abajo. " +
      "`intro`: UNA frase de encuadre, máximo 15 palabras. Si no agrega nada, dejala vacía. " +
      "`retos`: LOS SUPUESTOS — 4 a 6, ni uno más, ORDENADOS por riesgo de entrega (primero el que, si es falso, sale más caro). `title` = el supuesto en 3 a 8 palabras y SIN arrancar con 'Asumimos que' (el rótulo de la columna ya dice que son supuestos): 'Un solo proceso de ventas'. `detail` = máximo 20 PALABRAS con por qué lo asumimos y qué tan firme es el piso: 'Ventas lo describió en singular; operaciones nunca lo confirmó'. Sacalos de los huecos del handoff: lo que se prometió sin detallar, lo que se dijo a medias, lo que el alcance da por hecho. " +
      "Si te quedan más de 6, NO los apiles acá: quedate con los 6 de mayor riesgo y asegurate de que los que dejás afuera aparezcan igual como preguntas en «Plan de sesiones». " +
      "`porQueBullets`: LOS RIESGOS — 3 a 5, uno por riesgo DISTINTO. NO repitas el supuesto de enfrente con otras palabras: acá va lo que se rompe en la ENTREGA si ese supuesto resulta falso (tiempo, alcance, adopción, datos, plata). `title` = 2 a 5 palabras ('Cronograma se corre', 'Costo no cotizado'); `detail` = máximo 20 PALABRAS y UNA sola idea: 'Si hay dos procesos, el mapeo se duplica y la fase 2 no cierra'. " +
      "`objetivo`: UNA frase de máximo 25 palabras con QUÉ hay que confirmar primero y por qué ese primero ('Confirmar cuántos procesos de venta existen antes de diseñar el pipeline: todo lo demás depende de eso').",
    schema: asSchema(WEB_DIAGNOSIS_SCHEMA),
  },
  {
    key: "sesiones",
    label: "Plan de sesiones",
    eyebrow: "Qué preguntar, en qué orden y con quién",
    theme: "soft",
    sectionType: "exploracion_sesiones",
    agentGenerated: true,
    empty: { intro: "", sesiones: [] },
    agentHint:
      "2-4 sesiones ORDENADAS: cada una con objetivo, a quién invitar y las preguntas literales, cada pregunta con su repregunta. El orden importa (lo que desbloquea al resto va primero).",
    /* ── ESTA SECCIÓN ES LA HERRAMIENTA, NO EL RESUMEN ────────────────────────────────
       Es la única del documento donde MÁS es mejor: el CSE la lee con el cliente enfrente
       y una pregunta de más no cuesta nada, mientras que una de menos es una sesión que
       hay que repetir. Por eso acá los números suben (6-10 por sesión) justo cuando en
       «Lo que damos por supuesto» bajan. El presupuesto sale de ahí: esa sección pasó de
       ~10.400 caracteres a un tope mucho menor, y ese aire se gasta acá.

       La REPREGUNTA es lo que convierte un cuestionario en una entrevista: la respuesta
       genérica ("depende del caso", "más o menos así") es el modo de falla real de estas
       sesiones, y el CSE tiene que tener a mano cómo aterrizarla sin improvisar. */
    brief:
      "El guion operativo: cómo convertir los supuestos sin verificar en respuestas. Es la sección que el CSE lee CON EL CLIENTE ENFRENTE, así que va COMPLETA aunque quede larga — es la única del documento donde más es mejor. `intro`: 1 frase (opcional). " +
      "`sesiones`: 2-4, ORDENADAS por dependencia — primero la que desbloquea a las demás (si no sabés cuántos procesos hay, no podés preguntar el detalle de ninguno). Por sesión: " +
      "`orden` = el número como string ('1', '2'…); `titulo` = de qué va, en 3-6 palabras ('Cómo venden hoy'); " +
      "`objetivo` = UNA frase con qué hay que dejar CONFIRMADO al terminar ('Confirmar si hay uno o varios procesos de venta y quién es dueño de cada uno'); " +
      "`participantes` = a quién del CLIENTE hay que tener en la sala y POR QUÉ, en una línea ('Gerente comercial (define el proceso) + un vendedor senior (lo ejecuta de verdad)') — nombres propios SOLO si la fuente los trae; " +
      "`preguntas` = 6 a 10 por sesión, ORDENADAS como se van a hacer: primero las que abren el tema, después las que aprietan el detalle. Cada una es un objeto con dos campos: " +
      "  · `q` = la pregunta LITERAL, tal como se va a decir. Abierta y concreta ('Muéstrame el último negocio que cerraron: ¿por dónde entró y qué pasó después?'), nunca de sí/no ni genérica ('¿cómo es su proceso?'). Preferí pedir ejemplos y casos reales antes que definiciones. " +
      "  · `repregunta` = QUÉ HACER SI LA RESPUESTA SALE VAGA, en máximo 20 palabras y empezando por la condición: 'Si dice «depende del caso»: pedile los dos últimos casos y en qué se diferenciaron' / 'Si contesta el proceso ideal: preguntá cuándo fue la última vez que NO pasó así'. Es lo que evita que el CSE se quede con un «más o menos así» y tenga que volver a reunirse. Toda pregunta lleva la suya. " +
      "Cada pregunta debe poder rastrearse a un supuesto sin verificar: si no cierra ninguno, sobra. Si un supuesto quedó afuera de «Lo que damos por supuesto» por el tope de esa sección, acá SÍ tiene que aparecer su pregunta.",
    schema: {
      type: "object",
      properties: {
        intro: str,
        sesiones: arrayOf(
          {
            orden: str,
            titulo: str,
            objetivo: str,
            participantes: str,
            /* `preguntas` pasó de `string[]` a objetos. `hecha` (la casilla del CSE) NO
               está acá A PROPÓSITO: `coerceToSchema` descarta lo que no esté en el
               schema, así que el agente no puede marcar una pregunta como preguntada
               ni por error. La invariante la sostiene el tipo, no un pedido en el brief.
               Ver lib/canvas/exploracion-preguntas.ts. */
            preguntas: arrayOf({ q: str, repregunta: str }, ["q"]),
          },
          ["titulo", "objetivo", "preguntas"],
        ),
      },
      required: ["sesiones"],
    },
  },
  {
    key: "personas",
    label: "A quién involucrar",
    eyebrow: "Quién sabe qué del lado del cliente",
    theme: "light",
    sectionType: "pain",
    agentGenerated: true,
    empty: PAIN_EMPTY,
    agentHint: "Mapa de personas del cliente: qué sabe cada una, qué le importa y qué se le pregunta a ella y a nadie más.",
    brief:
      "El mapa de con quién hablar. Cada `item`: `title` = rol o nombre + rol si la fuente lo trae ('Gerente comercial — Andrea'); `detail` = UNA línea con qué sabe esa persona que nadie más sabe y qué le importa a ella ('Dueña del pipeline y de las metas: sabe por qué se cae un negocio; le importa que el equipo no pierda tiempo cargando datos'). " +
      "Incluí también a quien pueda BLOQUEAR (quien aprueba presupuesto o accesos) aunque no sea fuente de información. Solo personas/roles que la fuente mencione — no inventes un organigrama; si el handoff solo nombra un rol genérico, ponelo genérico y marcá `⚠️ Por verificar` quién lo ocupa.",
    schema: asSchema(PAIN_SCHEMA),
  },
  {
    key: "profundidad",
    label: "Qué hay que entender a fondo",
    eyebrow: "Dónde no alcanza con la superficie",
    theme: "soft",
    sectionType: "pain",
    agentGenerated: true,
    empty: PAIN_EMPTY,
    agentHint: "Los 2-5 temas donde una respuesta superficial hace fracasar la entrega, y qué es entenderlos de verdad.",
    brief:
      "Los pocos temas donde entender a medias arruina la entrega — el resto se puede aprender sobre la marcha. Cada `item`: `title` = el tema en 3-8 palabras ('Cómo identifican a un cliente duplicado'); `detail` = UNA línea con qué significa entenderlo DE VERDAD, es decir qué tenés que poder responder cuando termines ('Poder decir con qué campo se desduplica hoy y qué pasa con los registros viejos que no lo tienen'). " +
      "Priorizá por RIESGO DE ENTREGA: lo que, mal entendido, obliga a rehacer trabajo. Máximo 5 — una lista larga acá es una lista sin prioridad.",
    schema: asSchema(PAIN_SCHEMA),
  },
  {
    key: "cierre",
    label: "Cómo se cierra",
    eyebrow: "Cómo se cierra",
    theme: "dark",
    selfTitled: true,
    pinned: true,
    noHide: true,
    ctxDriven: true, // rinde su propia banda oscura; además lee `data` (CTA), como el kickoff
    sectionType: "exploracion_cta",
    agentGenerated: false, // CURADA: la escribe el equipo (el agente no la toca)
    empty: EXPLORACION_CIERRE_DEFAULT,
    agentHint: "",
    brief:
      "Cierre curado por el equipo: qué se hace con lo que se averigüe (mover lo confirmado a «Lo que ya sabemos», abrir las preguntas nuevas) + botón opcional a un recurso INTERNO (carpeta de notas, documento de descubrimiento). Nunca un enlace de cara al cliente: este documento no se comparte.",
    schema: {
      type: "object",
      properties: { eyebrow: str, headline: str, subhead: str, buttonLabel: str, buttonUrl: str, buttonTarget: str },
    },
  },
];

/** Template del canvas Exploración para el agente tipado (`generateSectionsForTemplate`).
 *  UN SOLO agente para todos los tipos de servicio (CRM, CDP, web, consultoría): el método
 *  es el mismo — leer el handoff, detectar el supuesto no verificado, derivar la pregunta.
 *  Un prompt por tipo de servicio produciría cuatro documentos que envejecen por separado. */
export const EXPLORACION_TEMPLATE: BcTemplateDef = {
  id: "exploracion_v1",
  caseLabel: "Exploración",
  // 18000 (era 14000, y la corrida real de Wherex ya salía ~10.600 tokens): el plan de
  // sesiones pasó de 3-6 preguntas por sesión a 6-10, y cada una suma su repregunta —
  // en el peor caso 30 preguntas con seguimiento contra las 15 sueltas de antes.
  // `generateSectionsForTemplate` ABORTA si stop_reason === "max_tokens", así que quedarse
  // corto acá no degrada el documento: lo deja sin generar. Mismo techo que Implementación.
  maxTokens: 18000,
  brandVoice: false, // documento INTERNO: sin metáfora de marca ni CTA-pregunta
  features: { useCaseChecklist: false },
  agentIntro:
    "Eres el CSE senior de Smarteam que prepara la EXPLORACIÓN del negocio de un cliente: el proyecto ya arrancó (el kickoff pasó) y hay que entender cómo funciona ese negocio de verdad para entregar bien. Escribes la guía INTERNA que usará el CSE a cargo — el cliente NUNCA la ve, así que hablás en lenguaje de equipo, sin cuidar la imagen ni suavizar.\n\n" +
    "TU MÉTODO (uno solo, sirve igual para CRM, CDP, web o consultoría — NO cambies de enfoque según el tipo de proyecto): leé el handoff, separá lo que está AFIRMADO de lo que se DIO POR SUPUESTO, y de cada supuesto no verificado derivá la pregunta que lo cierra. Las preguntas no salen de un checklist genérico de descubrimiento: salen de los huecos de ESTE handoff.\n\n" +
    "LA DISTINCIÓN QUE SOSTIENE EL DOCUMENTO: «Lo que ya sabemos» son hechos que la fuente afirma explícitamente (y cada uno dice de dónde salió). «Lo que damos por supuesto» es todo lo demás: lo que suena razonable, lo que el alcance da por hecho, lo que se prometió sin detallar. Ante la duda, va a supuestos. Poner un supuesto en «Lo que ya sabemos» hace que el CSE dé por cerrado algo que nadie confirmó — es el error más caro de este documento.\n\n" +
    "CALIBRACIÓN POR TAMAÑO DE CLIENTE (regla de negocio de Smarteam): a un cliente GRANDE (operación madura, equipos propios, procesos ya formalizados) no le sirve que le mapees lo que ya sabe — con él apuntá a lo que NO está viendo: las contradicciones entre áreas, lo que nadie es dueño, el dato que cada equipo interpreta distinto, el proceso que existe en el papel y no en la práctica. A un cliente CHICO (sin proceso formal, poca gente, todo en la cabeza de alguien) SÍ le sirve mapear lo obvio: ahí el valor está en escribir por primera vez cómo funciona. Inferí el tamaño/madurez del handoff, las etiquetas y el historial, y DECLARÁ en el subhead del hero qué calibración usaste y por qué — si te equivocás, el CSE lo corrige en un segundo.\n\n" +
    "DISCIPLINA ANTI-ALUCINACIÓN (dura): NUNCA inventes hechos, personas, sistemas, cifras ni procesos del cliente. Cuando algo no esté confirmado en la fuente, escribilo igual pero marcado con `⚠️ Por verificar` — un hueco marcado es correcto; un dato inventado es un error grave (el CSE lo llevaría a la sesión como verdad y quedaría mal parado frente al cliente).\n\n" +
    "FORMATO: cada sección tiene su PROPIO shape estructurado (lo indican su `schema` y su guía) — NO es prosa libre. Los `detail` van en UNA línea. Las preguntas del plan de sesiones se escriben LITERALES, como se van a decir en la sala: abiertas, pidiendo ejemplos y casos reales, nunca de sí/no.\n\n" +
    "Español, tuteo. Si una sección no tiene NADA de respaldo en la fuente, dejá sus arrays vacíos — vacío es correcto, inventado no.",
  sections: EXPLORACION_SECTION_DEFS,
};

/** Lookup key → def (seed, agente, SectionTools). */
export const EXPLORACION_DEF_BY_KEY: Record<string, BCSectionDef> = Object.fromEntries(
  EXPLORACION_SECTION_DEFS.map((d) => [d.key, d]),
);

/**
 * ALLOWLIST de secciones del canvas Handoff que ve el agente de exploración como fuente.
 * Es AMPLIA a propósito —el destinatario es interno y el handoff entero es material de
 * descubrimiento— pero explícita: si mañana el handoff gana una sección, entra acá por
 * decisión, no por arrastre.
 */
export const EXPLORACION_HANDOFF_KEYS = [
  "alcance_contratado",
  "motivacion_decision",
  "dolor_principal",
  "expectativas",
  "stakeholders_handoff",
  "acuerdos_promesas",
  "estado_en_flight",
  "riesgos_banderas",
  "desarrollo",
] as const;
