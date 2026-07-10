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
  // 2) Diagnóstico y contexto — retos (izq) + panel oscuro "Por qué X" (der)
  {
    key: "diagnostico",
    canvasLabel: "Diagnóstico y contexto",
    label: "Diagnóstico y contexto",
    eyebrow: "Diagnóstico",
    theme: "light",
    sectionType: "web_diagnosis",
    empty: { intro: "", retos: [], plataforma: "", porQueBullets: [], objetivo: "" },
    agentHint: "Retos (cards de 1 línea) + panel 'Por qué la plataforma' en bullets + objetivo corto. ESCUETO.",
    brief:
      "Diagnóstico y contexto, ESCUETO (se presenta en pantalla): `intro` de MÁXIMO 2 frases con el contexto esencial. `retos`: 3 a 5 retos actuales — `title` de 3 a 6 palabras en negrita (ej. 'Marca nueva sin presencia digital') + `detail` de UNA frase corta. `plataforma`: el nombre de la plataforma propuesta (ej. 'HubSpot Content Hub'). `porQueBullets`: 3 a 5 razones — `title` de 2 a 4 palabras (ej. 'CRM nativo', 'Autonomía total') + `detail` de UNA línea. `objetivo`: UNA frase compacta (ej. 'Posicionamiento institucional + generación de leads · MVP agosto 2026'). Fuente: SOLO lo discutido en el contexto. PROHIBIDO: párrafos de más de 2 líneas.",
    schema: {
      type: "object",
      properties: {
        intro: str,
        retos: arrayOf({ title: str, detail: str }, ["title"]),
        plataforma: str,
        porQueBullets: arrayOf({ title: str, detail: str }, ["title"]),
        objetivo: str,
      },
      required: ["retos", "porQueBullets", "objetivo"],
    },
  },
  // 3) Arquitectura del sitio — DIAGRAMA dark: Home + fases con cards top-level
  {
    key: "arquitectura_sitio",
    canvasLabel: "Arquitectura del sitio",
    label: "Arquitectura del sitio",
    eyebrow: "Estructura",
    theme: "dark",
    sectionType: "site_architecture",
    empty: { recorrido: "", home: "", fases: [] },
    agentHint: "Home + fases con secciones TOP-LEVEL (5-8 por fase, nombre + detalle de 2-4 palabras). NO subpáginas.",
    brief:
      "Arquitectura del sitio como DIAGRAMA (se presenta en pantalla, NO es un sitemap exhaustivo): `recorrido` = UNA frase con el camino del usuario (entra → descubre → convierte). `home` = rótulo del nodo raíz (ej. 'Home · resumen del ecosistema'). `fases`: 1 o 2 fases de lanzamiento — cada una con `nombre` corto (ej. 'Fase 1 · MVP — Agosto'), `badge` SOLO para fases futuras (ej. 'Próximamente'; fase 1 con badge vacío \"\") y `paginas` = SOLO las 4 a 8 secciones TOP-LEVEL del sitio, cada una con `nombre` (1-3 palabras, ej. 'Certificaciones') y `detalle` de 2 a 4 palabras (ej. 'Conversión → CRM'). PROHIBIDO listar subpáginas o rutas anidadas ('X > Y') — solo el primer nivel. Fuente: lo discutido; si no se detalló, proponé un primer nivel mínimo razonable.",
    schema: {
      type: "object",
      properties: {
        recorrido: str,
        home: str,
        fases: arrayOf(
          { nombre: str, badge: str, paginas: arrayOf({ nombre: str, detalle: str }, ["nombre"]) },
          ["nombre"],
        ),
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
      "Arquitectura de conexión como CADENA de 4 pasos (se presenta como cards con flechas): típico Visitante ('Búsqueda, IA o campaña') → Sitio ('HubSpot Content Hub · formularios y CTAs') → HubSpot CRM ('Lead registrado al instante') → Equipo comercial ('Notificación y seguimiento'). Cada paso: `actor` (quién/qué), `titulo` de 3 a 6 palabras y `detalle` de UNA línea. `intro`: máximo 2 frases (ej. 'El sitio se construye dentro de HubSpot: sitio y CRM son la misma plataforma'). `fueraDeAlcance` y `opcionales`: frases cortas. Fuente: SOLO sistemas mencionados.",
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
      "Qué incluye el proyecto: `entregables` = lista PLANA de 5 a 9 COSAS CONCRETAS que el cliente RECIBE (sustantivos tangibles, ej.: 'Sitio desarrollado en HubSpot Content Hub', 'URL provisional para revisión durante el proyecto', 'Base SEO y AEO implementada', 'Formularios de HubSpot conectados al CRM', 'Capacitación para actualizar contenido'). Cada entregable: `title` de 3 a 7 palabras + `detail` de UNA línea corta con qué incluye. `resultado`: una frase con lo que el cliente tiene al final. PROHIBIDO: fases, etapas, semanas, actividades o proceso de trabajo (todo eso vive SOLO en el Cronograma) — si un punto empieza con un verbo de actividad ('diseñar', 'desarrollar', 'definir'), reformulalo como cosa entregada. Fuente: el alcance discutido; no prometas lo que no se habló.",
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
    empty: { moneda: "", lineas: [], extras: [], recurrentes: [], nota: "", anchoRecurrente: "normal" },
    agentHint: "Moneda + líneas fase 1 (montos numéricos: el total se suma solo) + extras + recurrente mensual + nota de exclusiones.",
    brief:
      "Inversión: `moneda` = código de la moneda discutida (ej. 'USD'; si no se mencionó, 'USD'). `lineas` de la fase 1 con `concepto` corto, `detalle` de una línea y `monto` NUMÉRICO limpio con formato '$1,800' o rango '$5,600–6,650' — el sistema SUMA los montos automáticamente para el total, así que NO agregues texto dentro del monto (nada de 'por página' ni 'aprox'); si no hay precio discutido ni derivable, dejá el monto como string vacío \"\". `extras`: opcionales cotizados aparte (mismo formato de monto, con '+' opcional). `recurrentes`: costos mensuales (licencias, mantenimiento) SIEMPRE separados de la inversión única. `nota`: exclusiones o condiciones en pocas palabras (ej. 'impuestos no contemplados'). `anchoRecurrente`: 'normal' (default) o 'ancho' — poné 'ancho' SOLO si te lo piden explícitamente (ej. 'hacé la card de recurrente mensual más ancha'), para que ocupe más espacio visual. Fuente / regla: SOLO montos discutidos en el contexto o derivables del alcance — NUNCA números inventados.",
    schema: {
      type: "object",
      properties: {
        moneda: str,
        lineas: arrayOf({ concepto: str, monto: str, detalle: str }, ["concepto"]),
        extras: arrayOf({ concepto: str, monto: str, detalle: str }, ["concepto"]),
        recurrentes: arrayOf({ concepto: str, monto: str, detalle: str }, ["concepto"]),
        nota: str,
        anchoRecurrente: str,
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
