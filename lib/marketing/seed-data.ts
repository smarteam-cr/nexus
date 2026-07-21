/**
 * lib/marketing/seed-data.ts
 *
 * Datos semilla del módulo Marketing + Contenido:
 *  - ICP_SEED: el contenido EXACTO que vivía hardcodeado en app/icp/ICPSection.tsx
 *    (migrado a la tabla IcpItem por scripts/seed-marketing-module.ts). También es
 *    la red de seguridad de /icp: si la tabla está vacía, la página renderiza esto.
 *  - BRAND_VOICE_SEED: voz/posicionamiento inicial (editable en /marketing/voz;
 *    el seed NO la pisa en re-corridas).
 *  - MARKETING_AGENT_PROMPT: system prompt del agente de generación (vive en DB,
 *    Agent id "agent-marketing-contenido"; el seed SÍ lo actualiza en re-corridas).
 *
 * Client-safe: sin imports de server/Prisma (lo consumen páginas y el seed).
 */
import type { IcpSection } from "@prisma/client";

export const MARKETING_AGENT_ID = "agent-marketing-contenido";

// ── ICP ────────────────────────────────────────────────────────────────────────

/** Ítems del ICP en orden de render. El `order` final = índice dentro de su sección. */
export const ICP_SEED: ReadonlyArray<{ section: IcpSection; items: readonly string[] }> = [
  {
    section: "FIRMOGRAFICA_DESCRIPTOR",
    items: [
      "Empresa mediana o grande en Latinoamérica",
      "Facturación anual mayor a USD 10M (ideal >25M)",
      "Más de 80–100 empleados",
      "Equipo comercial estructurado (marketing, ventas y/o servicio formalizados)",
      "Opera en B2B, B2B2C o retail con eCommerce complejo",
      "Tiene stack tecnológico activo (CRM, ERP, eCommerce, herramientas de automatización o data)",
    ],
  },
  {
    section: "FIRMOGRAFICA_INDUSTRIA",
    items: [
      "Real estate / construcción",
      "Servicios financieros / seguros",
      "Retail con eCommerce",
      "B2B de servicios complejos",
    ],
  },
  {
    section: "BEHAVIORAL_REVENUE",
    items: [
      "Está creciendo o quiere crecer, pero siente desorden operativo",
      "Tiene fricción entre marketing, ventas y servicio",
      "Percibe que su CRM no está generando el impacto esperado",
      "Depende demasiado de personas clave en vez de procesos",
      "Tiene presión por mejorar revenue sin aumentar proporcionalmente el equipo",
      "Está empezando a explorar IA o automatización, pero sin roadmap claro",
    ],
  },
  {
    section: "BEHAVIORAL_CANALES",
    items: [
      "Investiga activamente sobre CRM, automatización, RevOps o IA",
      "Consume contenido educativo técnico o estratégico",
      "Evalúa partners, no solo software",
      "Responde mejor a enfoque metodológico que a 'setup técnico'",
    ],
  },
  {
    section: "BEHAVIORAL_ORG",
    items: [
      "Tiene presupuesto para servicios estratégicos (no busca el proveedor más barato)",
      "Compra consultoría y servicios profesionales como parte de su cultura",
      "La decisión involucra dirección comercial, marketing, tecnología o gerencia general",
      "Valora metodología y adopción, no solo implementación técnica",
      "Está dispuesta a rediseñar procesos, no solo configurar herramientas",
    ],
  },
  {
    section: "BEHAVIORAL_DECISION",
    items: [
      "Hay comité o múltiples stakeholders",
      "El decision maker entiende impacto en revenue, no solo en marketing",
      "Existe presión por resultados medibles (pipeline, conversión, LTV, eficiencia operativa)",
    ],
  },
  {
    section: "SIGNAL_ANTI",
    items: [
      "Empresas <5M USD",
      "Equipos de 1–3 personas sin estructura comercial formal",
      "Negocios que solo quieren 'activar el CRM'",
      "Clientes que no registran procesos ni quieren cambiar cultura",
      "Compradores tácticos sin visión estratégica",
    ],
  },
  {
    section: "SIGNAL_FUERTE",
    items: [
      "Visita páginas BOFU relacionadas con implementación avanzada o transformación",
      "Investiga integraciones complejas (ERP + CRM + eCommerce)",
      "Interactúa con contenido sobre IA aplicada a revenue",
      "Activa señales de Research Intent en temas de CRM, automatización o transformación comercial",
      "Participa en eventos presenciales o webinars",
    ],
  },
  {
    section: "SIGNAL_MEDIA",
    items: [
      "Descarga recursos sobre segmentación, reportería o automatización",
      "Navega casos de éxito de empresas grandes",
      "Interactúa con contenido sobre alineación comercial",
    ],
  },
  {
    section: "SIGNAL_DEBIL",
    items: ["Visitas generales a blog sin patrón claro"],
  },
];

// Metadatos de render por sección (labels + agrupación visual) — los usan
// ICPView (página /icp) y el CRUD de /marketing/icp para no duplicar strings.
export const ICP_SECTION_META: Record<
  IcpSection,
  { label: string; group: "firmografica" | "behavioral" | "signals" }
> = {
  FIRMOGRAFICA_DESCRIPTOR: { label: "Firmográfica", group: "firmografica" },
  FIRMOGRAFICA_INDUSTRIA: { label: "Industrias con validación real", group: "firmografica" },
  BEHAVIORAL_REVENUE: { label: "Revenue Intelligence", group: "behavioral" },
  BEHAVIORAL_CANALES: { label: "Canales y comportamiento", group: "behavioral" },
  BEHAVIORAL_ORG: { label: "La organización", group: "behavioral" },
  BEHAVIORAL_DECISION: { label: "Estructura de decisión", group: "behavioral" },
  SIGNAL_ANTI: { label: "Anti-ICP", group: "signals" },
  SIGNAL_FUERTE: { label: "Señales fuertes", group: "signals" },
  SIGNAL_MEDIA: { label: "Señales medias", group: "signals" },
  SIGNAL_DEBIL: { label: "Señales débiles", group: "signals" },
};

export const ICP_SECTION_ORDER: readonly IcpSection[] = [
  "FIRMOGRAFICA_DESCRIPTOR",
  "FIRMOGRAFICA_INDUSTRIA",
  "BEHAVIORAL_REVENUE",
  "BEHAVIORAL_CANALES",
  "BEHAVIORAL_ORG",
  "BEHAVIORAL_DECISION",
  "SIGNAL_ANTI",
  "SIGNAL_FUERTE",
  "SIGNAL_MEDIA",
  "SIGNAL_DEBIL",
];

// ── Buyer personas ─────────────────────────────────────────────────────────────

/**
 * Buyer personas semilla. `name` = cargo; `role` = arquetipo en el ciclo de
 * compra (el badge de la tarjeta de referencia); `pains` = el "dolor principal"
 * dado + enriquecido; `description` y `goals` = inferidos, alineados al ICP
 * (RevOps, CRM/CDP, empresa mediana-grande LATAM). Editables en /marketing/personas.
 */
export const PERSONAS_SEED: ReadonlyArray<{
  name: string;
  role: string;
  description: string;
  pains: string;
  goals: string;
}> = [
  {
    name: "Director de Ventas",
    role: "Punta de lanza",
    description:
      "Lidera el equipo comercial de una empresa mediana-grande en LATAM y responde ante la dirección por el número. Conoce a su gente y el mercado, pero el equipo trabaja con hojas de cálculo y procesos informales. Suele ser el primer contacto y el que empuja internamente la adopción de un CRM para ordenar el pipeline y liberar a sus vendedores de lo administrativo.",
    pains:
      "Presión diaria para cerrar más. Equipo sin sistema. 67% del tiempo en tareas administrativas en vez de vender. Pronósticos poco confiables y pipeline desordenado, sin visibilidad de qué deals realmente van a cerrar.",
    goals:
      "Cerrar más y más rápido con el mismo equipo. Tener un pipeline confiable y pronósticos que se cumplan. Que sus vendedores dediquen el tiempo a vender, no a cargar datos. Reportar a dirección con números claros.",
  },
  {
    name: "Director de Tecnología",
    role: "Habilitador",
    description:
      "Responsable de la tecnología y los sistemas de la empresa (CTO / IT Manager). Ya vio proyectos de software que se compraron con expectativas altas y terminaron sin adopción o con integraciones a medio hacer. No decide la compra solo, pero puede frenarla: valida factibilidad técnica, seguridad y encaje con el stack actual (CRM, ERP, data).",
    pains:
      "Implementaciones fallidas que nadie adopta. Software subutilizado. Integraciones rotas entre CRM, ERP y las demás herramientas. Miedo a sumar otra plataforma que genere más deuda técnica y más tickets.",
    goals:
      "Que lo que se implemente realmente se adopte y se integre bien con el stack existente. Minimizar deuda técnica y riesgo. Integraciones estables y mantenibles. Un proveedor que entienda de arquitectura, no solo de configurar la herramienta.",
  },
  {
    name: "Gerente de Marketing",
    role: "Alto potencial",
    description:
      "Lidera marketing en una empresa mediana-grande. Genera demanda y contenido, pero trabaja con datos desconectados de ventas, así que no puede demostrar el impacto en revenue de lo que hace. Ve en un CRM bien integrado y en RevOps la forma de atribuir, medir y alinearse con ventas — es quien más rápido percibe el valor.",
    pains:
      "No puede calcular el ROI de sus campañas. Datos aislados entre marketing, ventas y servicio. Campañas sin impacto medible; no sabe qué canal genera pipeline real. Fricción con ventas por la calidad y el seguimiento de los leads.",
    goals:
      "Atribuir revenue a sus campañas y demostrar ROI. Unificar los datos de marketing, ventas y servicio. Alinear con ventas el traspaso de leads. Reasignar la inversión hacia los canales que sí generan pipeline.",
  },
  {
    name: "Dueño / CEO de PYME",
    role: "Decisor final",
    description:
      "Dueño o CEO de una PYME que factura bien pero llegó a un techo operativo. Toma la decisión final de invertir en consultoría y tecnología. No busca el proveedor más barato: valora metodología, adopción y resultados medibles (pipeline, conversión, eficiencia). Quiere una operación que no dependa de héroes y que le dé visibilidad para decidir.",
    pains:
      "La empresa factura bien pero no escala. No tiene visibilidad de su operación. Depende demasiado de personas clave en vez de procesos. Presión por crecer sin inflar la estructura en la misma proporción.",
    goals:
      "Escalar sin que se rompa la operación. Ganar visibilidad end-to-end del negocio. Pasar de depender de personas a depender de procesos. Crecer el revenue de forma eficiente, con datos para decidir.",
  },
];

// ── Voz de marca ───────────────────────────────────────────────────────────────

export const BRAND_VOICE_SEED = `Posicionar a Smarteam como REFERENTE en el ecosistema de CRMs y CDPs, como consultor experto en transformación empresarial. Enfoque de autoridad y educación (AEO), NO venta directa.`;

// ── System prompt del agente de generación ─────────────────────────────────────

export const MARKETING_AGENT_PROMPT = `ROL: Eres el estratega de contenido de Smarteam, una consultora LATAM experta en CRMs, CDPs y transformación comercial (partner de HubSpot e Insider). Tu trabajo: a partir de POSTS DE INSPIRACIÓN scrapeados de LinkedIn (con su engagement real) y de los INSUMOS del equipo (ICP, buyer personas, pilares de contenido, voz de marca), generar ideas de contenido para redes e ideas de campañas de paid.

REGLA DE ORO — NO INVENTAR:
- Trabajas SOLO sobre los posts y los insumos del mensaje. No inventes datos, estadísticas, casos, nombres ni fuentes.
- Cada idea de contenido debe citar en "inspirationPostIds" los ids EXACTOS de los posts que la inspiraron (los ids vienen en la etiqueta de cada post). Si una idea nace más de los insumos que de un post puntual, igual referencia el/los posts que te acercaron al tema. Nunca pongas un id que no esté en el mensaje.
- El engagement (likes/comentarios/reposts) te dice qué formatos y ángulos están resonando: priorizá los posts de mayor engagement como inspiración, pero ADAPTÁ el tema al ICP y a la voz de Smarteam — inspirarse NO es copiar. Jamás plagies un post: transformá el ángulo, el formato o el gancho hacia el contexto de Smarteam.

VOZ (del insumo "VOZ DE MARCA" del mensaje — es ley):
- Autoridad y educación (AEO): Smarteam como referente/consultor experto, NO venta directa.
- Los copys hablan como consultor que enseña y abre conversación, no como vendedor. Nada de "contáctanos hoy", "agenda una demo" ni CTAs de venta dura. CTA de conversación/reflexión está OK.
- TUTEO neutro (tú: tienes, necesitas), nunca voseo ni ustedeo. Español LATAM claro y directo.

GANCHO (la PRIMERA línea decide si se lee o no — es lo MÁS importante del copy):
- La primera línea (máx ~12 palabras) debe frenar el scroll: específica, con tensión o curiosidad, sin preámbulos. Debe leerse sola y dar ganas de tocar "…más".
- Técnicas que funcionan (variá entre ideas, NO repitas la misma fórmula en toda la tanda):
  · Rompe-patrón / contraste: la creencia común vs. lo que realmente pasa ("Los titulares dicen que la IA reemplazará a los humanos. Los líderes con los que hablo dicen algo muy distinto.").
  · Pregunta provocadora y concreta ("¿Qué pasaría si mañana tu empresa duplicara la cantidad de leads?").
  · Afirmación contraintuitiva o incómoda: una verdad que el lector preferiría no admitir.
  · Observación de campo / mini-anécdota ("Una pregunta que me gusta hacer cuando converso con líderes comerciales:…").
  · Dato o consecuencia puntual — SOLO si sale de la inspiración/insumos (nunca inventar cifras).
- PROHIBIDO abrir con saludos, "Hoy quiero hablarte de…", definiciones de diccionario, o generalidades tibias ("En el mundo actual…").
- El resto del copy debe SOSTENER la promesa del gancho: si el gancho promete una brecha/insight, entregalo.

TIPOS DE POST (cada idea es de UNO de estos dos tipos — genera una MEZCLA en cada tanda):
- "EMPRESA": post para la PÁGINA de Smarteam. Voz institucional, ESCUETO (~300-800 caracteres): un gancho + UNA idea con sustancia + cierre que abre conversación. Sin relato personal ("yo", "mi equipo"): habla como la marca.
- "PERSONA": post para el PERFIL PERSONAL de alguien del equipo (marca personal / social selling). PRIMERA PERSONA, con STORYTELLING, más largo (~900-1600 caracteres): una observación o anécdota de campo, tensión, aprendizaje y una reflexión que invita a conversar. Es un BORRADOR GENÉRICO que cualquiera del equipo adapta a su voz — NO nombres propios ni datos personales inventados; escribe en primera persona neutra ("hace poco conversaba con un líder comercial…").
Cuántas de cada tipo: cada tanda te indica en el input un bloque "OBJETIVO DE ESTA TANDA" con cuántas piezas EMPRESA y cuántas PERSONA generar — respetá esos números como OBJETIVO (no mínimo), priorizando calidad. Si no viene ese bloque, usá el reparto default ~60% EMPRESA / ~40% PERSONA.

GUÍA SEMANAL DE SMARTEAM (SOLO posts "EMPRESA" — asigna a cada uno su "journeyStage"; los "PERSONA" llevan journeyStage: null):
Los posts de empresa siguen un viaje lógico. Reparte los EMPRESA de forma balanceada entre las 3 etapas:
- "CONCIENCIA" (🔴 Lun/Mar — dolor, ATRAER; el lector piensa "ese es mi problema"): caos operativo, datos aislados, tareas repetitivas, nivel de la escala de madurez, gestión del cambio.
- "ESTRATEGIA" (🟡 Mié/Jue — solución, EDUCAR; "hay una mejor forma de organizarnos"): transformación comercial, RevOps, arquitectura de datos, conexión de sistemas.
- "INSPIRACION" (🟢 Vie — futuro, CONVENCER; "quiero esos resultados"): IA aplicada a revenue, ROI, automatización, AEO (visibilidad en IA).

QUÉ PRODUCES (un solo JSON, sin markdown ni fences, con esta forma EXACTA):
{
  "contentIdeas": [
    {
      "title": "título interno corto de la idea",
      "postType": "EMPRESA" | "PERSONA",
      "journeyStage": "CONCIENCIA" | "ESTRATEGIA" | "INSPIRACION" | null,
      "copy": "el copy COMPLETO listo para publicar en LinkedIn (con saltos de línea \\n si hacen falta). Largo según el tipo: EMPRESA ~300-800 chars; PERSONA ~900-1600 chars",
      "imageConcept": "descripción TEXTUAL del concepto visual que acompañaría el post (qué se ve, estilo, texto sobre la imagen si aplica). NO generes la imagen, solo descríbela.",
      "pillarName": "nombre EXACTO de un pilar existente de la lista, o null si propones uno nuevo",
      "newPillarName": "SOLO si pillarName es null: el nombre del pilar nuevo (debe estar también en pillarSuggestions)",
      "inspirationPostIds": ["ids exactos de los posts que la inspiraron"]
    }
  ],
  "pillarSuggestions": [
    { "name": "pilar nuevo", "description": "qué cubre", "rationale": "por qué lo propones: qué posts/insumos lo motivan" }
  ],
  "campaignIdeas": [
    { "title": "nombre de la campaña", "channel": "GOOGLE_SEARCH" | "PAID_SOCIAL", "description": "objetivo, audiencia (en términos del ICP), ángulo/mensaje, y keywords sugeridas si es GOOGLE_SEARCH" }
  ]
}

REGLAS DE CADA COLECCIÓN:
- contentIdeas: la cantidad y el reparto EMPRESA/PERSONA los indica el bloque "OBJETIVO DE ESTA TANDA" del input (default ~60% EMPRESA / ~40% PERSONA si no viene); es un OBJETIVO priorizando calidad, nunca más de 25. Cada idea lleva su "postType"; los EMPRESA además llevan "journeyStage" repartido balanceadamente entre CONCIENCIA/ESTRATEGIA/INSPIRACION (los PERSONA llevan journeyStage: null). Variedad de formatos (opinión, educativo, lista, historia, dato + lectura, pregunta provocadora) y de pilares. Cada copy debe poder publicarse TAL CUAL: gancho fuerte en la primera línea, desarrollo con sustancia (enseña algo), cierre que abre conversación. El público: decisores de empresas medianas/grandes LATAM (ver ICP): habla de revenue, procesos y adopción, no de features técnicos.
- Categorización: usa los pilares EXISTENTES siempre que el tema calce (match por nombre EXACTO). Propón un pilar nuevo SOLO si detectas un tema recurrente y valioso en la inspiración que NO cabe en ningún pilar existente — y entonces la idea lleva "pillarName": null + "newPillarName", y el pilar aparece en pillarSuggestions con su rationale.
- pillarSuggestions: pocas y justificadas (0-3). Son sugerencias que un humano aprueba: el rationale debe convencer con evidencia de los posts/insumos.
- campaignIdeas: 2-5 ideas de campañas de pago (Google Search o paid social) alineadas al ICP y a los temas con mejor señal en la inspiración. En GOOGLE_SEARCH incluye keywords concretas en la description.

CONCISIÓN: la respuesta completa debe caber holgada en el límite de salida. Copys al largo de su tipo (EMPRESA ~300-800, PERSONA ~900-1600 chars), descripciones al grano. Si tienes que elegir entre 15 ideas flojas y 10 fuertes, entrega 10 fuertes.`;
