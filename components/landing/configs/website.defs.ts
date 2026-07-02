/**
 * components/landing/configs/website.defs.ts
 *
 * Defs (server-safe) del template SITIO WEB — estructura de la propuesta RIGORA,
 * 8 secciones. La Portada usa sectionType "hero" (reusa HeroSection: brand-row,
 * chips y portada con imagen + carry-forward al regenerar) y la sección 4 reusa
 * "tech_architecture" (sections-shared). Schemas SOLO con hojas string.
 */
import type { BCSectionDef } from "./business-case.defs";
import { makeTechArchitectureDef } from "./shared-sections.defs";

const str = { type: "string" } as const;
const strArray = { type: "array", items: { type: "string" } } as const;
function arrayOf(props: Record<string, unknown>, required: string[]) {
  return { type: "array", items: { type: "object", properties: props, required } } as const;
}

export const WEBSITE_SECTION_DEFS: BCSectionDef[] = [
  // 1) Portada — reusa el renderer del hero (sectionType default = key "hero").
  {
    key: "hero",
    canvasLabel: "Portada",
    label: "Portada de la propuesta",
    theme: "dark",
    backdrop: true,
    selfTitled: true,
    empty: { headline: "", subhead: "", tags: [], brands: [] },
    agentHint: "Portada: nombre del proyecto + subtítulo + chips (fecha, alcance MVP, vigencia).",
    brief:
      "Portada de la propuesta de sitio web. `headline`: 'Sitio web de [Nombre cliente]' o el nombre del proyecto si se mencionó. `subhead`: una frase que resume qué se propone construir y para qué. `tags`: 2 a 4 chips (p.ej. fecha de la propuesta, 'MVP en X semanas', vigencia, plataforma). Fuente: extraé del contexto el nombre del cliente y el alcance discutido.",
    schema: { type: "object", properties: { headline: str, subhead: str, tags: strArray }, required: ["headline", "subhead"] },
  },
  // 2) Diagnóstico y contexto
  {
    key: "diagnostico",
    canvasLabel: "Diagnóstico y contexto",
    label: "Diagnóstico y contexto",
    eyebrow: "Diagnóstico",
    theme: "light",
    sectionType: "web_diagnosis",
    empty: { intro: "", retos: [], porQuePlataforma: "", objetivo: "" },
    agentHint: "Contexto del cliente + retos del sitio actual + por qué la plataforma + objetivo.",
    brief:
      "Diagnóstico y contexto: `intro` con el contexto del negocio y del proyecto. `retos`: 3 a 5 problemas del sitio/presencia actual tal como surgieron en la conversación (no genéricos). `porQuePlataforma`: por qué Content Hub (o la plataforma discutida) resuelve esos retos. `objetivo`: qué debe lograr el sitio nuevo (leads, autoservicio, posicionamiento). Fuente: SOLO lo discutido en el contexto.",
    schema: {
      type: "object",
      properties: {
        intro: str,
        retos: arrayOf({ title: str, detail: str }, ["title"]),
        porQuePlataforma: str,
        objetivo: str,
      },
      required: ["retos", "objetivo"],
    },
  },
  // 3) Arquitectura del sitio (sitemap por fases)
  {
    key: "arquitectura_sitio",
    canvasLabel: "Arquitectura del sitio",
    label: "Arquitectura del sitio",
    eyebrow: "Estructura",
    theme: "soft",
    sectionType: "site_architecture",
    empty: { recorrido: "", fases: [] },
    agentHint: "Recorrido del usuario + sitemap por fases (páginas; fases futuras con badge).",
    brief:
      "Arquitectura del sitio: `recorrido` describe el camino del usuario (llega → entiende → confía → convierte). `fases`: el sitemap agrupado por fases de lanzamiento — cada fase con `nombre` (ej. 'Fase 1 — Lanzamiento'), `paginas` (Home, Servicios, Casos, Contacto…) y `badge` SOLO para fases futuras (ej. 'Próximamente'; fase 1 va con badge vacío \"\"). Fuente: páginas y fases discutidas; si no se detalló, proponé un sitemap mínimo razonable para el negocio y marcá lo demás como fase 2.",
    schema: {
      type: "object",
      properties: {
        recorrido: str,
        fases: arrayOf({ nombre: str, badge: str, paginas: strArray }, ["nombre"]),
      },
      required: ["fases"],
    },
  },
  // 4) Arquitectura de conexión — REUSA tech_architecture (sections-shared)
  makeTechArchitectureDef({
    key: "arquitectura_conexion",
    canvasLabel: "Arquitectura de conexión",
    label: "Arquitectura de conexión",
    theme: "light",
    brief:
      "Arquitectura de conexión: cómo fluye la información Visitante → Sitio → CRM → Equipo comercial. `nodos`: cada pieza (sitio, formularios, CRM, correo, WhatsApp…) con su rol. `flujos`: qué dato viaja y cuándo (ej. 'Formulario' → 'CRM': lead con origen y página). `fueraDeAlcance`: qué NO incluye esta fase (ej. integración con ERP). `opcionales`: conexiones a futuro. Fuente: SOLO sistemas mencionados en el contexto.",
  }),
  // 5) Alcance — lista PLANA de entregables (≠ etapas: eso vive en Cronograma)
  {
    key: "alcance",
    canvasLabel: "Alcance",
    label: "Qué incluye el proyecto",
    eyebrow: "Entregables",
    theme: "soft",
    sectionType: "web_scope",
    empty: { entregables: [], resultado: "" },
    agentHint: "Lista PLANA de entregables (cosas que el cliente RECIBE) + resultado. NUNCA etapas ni actividades.",
    brief:
      "Qué incluye el proyecto: `entregables` = lista PLANA de 5 a 9 COSAS CONCRETAS que el cliente RECIBE (sustantivos tangibles, ej.: 'Sitio desarrollado en HubSpot Content Hub', 'URL provisional para revisión durante el proyecto', 'Base SEO y AEO implementada', 'Formularios de HubSpot conectados al CRM', 'Capacitación para actualizar contenido'). Cada entregable: `title` corto + `detail` de 1 línea con qué incluye. `resultado`: una frase con lo que el cliente tiene al final. PROHIBIDO: fases, etapas, semanas, actividades o proceso de trabajo (todo eso vive SOLO en el Cronograma) — si un punto empieza con un verbo de actividad ('diseñar', 'desarrollar', 'definir'), reformulalo como cosa entregada. Fuente: el alcance discutido; no prometas lo que no se habló.",
    schema: {
      type: "object",
      properties: {
        entregables: arrayOf({ title: str, detail: str }, ["title"]),
        resultado: str,
      },
      required: ["entregables"],
    },
  },
  // 6) Cronograma — SOLO tiempos (los entregables viven en el Alcance)
  {
    key: "metodologia", // key histórica — no romper canvases ya sembrados
    canvasLabel: "Cronograma",
    label: "Cronograma",
    eyebrow: "Plan de trabajo",
    theme: "light",
    sectionType: "web_methodology",
    empty: { fases: [], cotizaAparte: "" },
    agentHint: "SOLO el cronograma: fases con semanas y una línea de qué pasa en cada una.",
    brief:
      "Cronograma del proyecto: `fases` con `name` (corto, ej. 'Discovery y arquitectura'), `duration` en semanas (ej. 'Semanas 1-2') y `detail` de UNA sola línea con qué se decide o valida en esa fase. Típico: Discovery y arquitectura → Diseño → Desarrollo → Contenido y QA → Lanzamiento. PROHIBIDO listar entregables (viven en 'Qué incluye el proyecto') o párrafos largos de metodología — esta sección es el mapa de TIEMPOS, nada más. `cotizaAparte`: qué queda fuera y se cotiza por separado. Regla: las semanas se infieren del alcance; no inventes fechas de calendario.",
    schema: {
      type: "object",
      properties: {
        fases: arrayOf({ name: str, detail: str, duration: str }, ["name", "detail"]),
        cotizaAparte: str,
      },
      required: ["fases"],
    },
  },
  // 7) Inversión
  {
    key: "inversion",
    canvasLabel: "Inversión",
    label: "Inversión",
    eyebrow: "Inversión",
    theme: "soft",
    sectionType: "web_investment",
    empty: { lineas: [], extras: [], recurrentes: [], nota: "" },
    agentHint: "Líneas fase 1 (rangos), extras opcionales y recurrente mensual SEPARADO; sin inventar precios.",
    brief:
      "Inversión: `lineas` de la fase 1 con `concepto`, `monto` (RANGO si no hay precio cerrado) y `detalle`. `extras`: opcionales cotizados aparte. `recurrentes`: costos mensuales (licencias, mantenimiento) SIEMPRE separados de la inversión única. `nota`: vigencia/condiciones. Fuente / regla: solo montos discutidos en el contexto o derivables del alcance; si no hay → 'A definir en propuesta formal', NUNCA números inventados.",
    schema: {
      type: "object",
      properties: {
        lineas: arrayOf({ concepto: str, monto: str, detalle: str }, ["concepto"]),
        extras: arrayOf({ concepto: str, monto: str, detalle: str }, ["concepto"]),
        recurrentes: arrayOf({ concepto: str, monto: str, detalle: str }, ["concepto"]),
        nota: str,
      },
      required: ["lineas"],
    },
  },
  // 8) Por qué Smarteam
  {
    key: "por_que_smarteam",
    canvasLabel: "Por qué Smarteam",
    label: "Por qué Smarteam",
    eyebrow: "Partner",
    theme: "dark",
    sectionType: "why_us",
    // buttonLabel VACÍO en el empty: con default, "Limpiar" dejaría la sección
    // no-blank (visible externa con solo el botón). El placeholder de edición ya
    // sugiere el texto y el brief se lo pide al agente.
    empty: { cards: [], siguientePaso: "", buttonLabel: "" },
    agentHint: "4 cards de credenciales/diferenciales + siguiente paso + CTA.",
    brief:
      "Por qué Smarteam: `cards` (hasta 4) con credenciales y diferenciales relevantes para ESTE proyecto — 'HubSpot Partner Elite' y '+200 proyectos, +8 países LATAM' son fijas; sumá referencia sectorial o equipo solo si hay evidencia. `siguientePaso`: qué sigue si avanzan (ej. sesión de arquitectura / firma). `buttonLabel`: 'Agendar siguiente paso'.",
    schema: {
      type: "object",
      properties: {
        cards: arrayOf({ title: str, detail: str }, ["title"]),
        siguientePaso: str,
        buttonLabel: str,
      },
      required: ["cards"],
    },
  },
];
