/**
 * components/landing/configs/website.defs.ts
 *
 * Defs (server-safe) del template SITIO WEB — estructura de la propuesta RIGORA,
 * 8 secciones. La Portada usa sectionType "hero" (reusa HeroSection: brand-row,
 * chips y portada con imagen + carry-forward al regenerar) y la sección 4 reusa
 * "tech_architecture" (sections-shared). Schemas SOLO con hojas string.
 */
import type { BCSectionDef } from "./business-case.defs";
import { makeDiagramArchitectureDef } from "./shared-sections.defs";

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
  // 4) Arquitectura de conexión — motor de diagramas (la data vieja en cadena se
  //    convierte lazy en el renderer).
  makeDiagramArchitectureDef({
    key: "arquitectura_conexion",
    canvasLabel: "Arquitectura de conexión",
    label: "Arquitectura de conexión",
    theme: "light",
    brief:
      "Arquitectura de conexión como MAPA DE SISTEMAS (se dibuja como diagrama: cajas = sistemas, flechas = datos que fluyen). Típico: Sitio ('HubSpot Content Hub · formularios y CTAs') → HubSpot CRM ('Lead registrado al instante') → herramientas del equipo comercial. `intro`: máximo 2 frases (ej. 'El sitio se construye dentro de HubSpot: sitio y CRM son la misma plataforma'). `sistemas` (2-5): SOLO herramientas con login/API/BD propia mencionadas — `nombre` EXACTO, `rol` corto, `detalle` de 1 línea. `conexiones`: `desde`/`hacia` con el `nombre` EXACTO · `titulo` = el dato que fluye (3-6 palabras) · `cuando` = qué lo dispara · `direction` 'to'/'bidir' · `syncType` 'realtime'/'batch'/'manual' · si algo está por confirmar: '⚠️ Por definir' + `pending: 'si'`. `fueraDeAlcance` y `opcionales`: frases cortas. No inventes integraciones.",
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
    // Ver el gemelo de business-case.defs.ts: los montos los escribe Ventas a mano.
    agentGenerated: false,
    tip: "La escribe Ventas: el agente no toca los montos. El total se calcula solo.",
    empty: { moneda: "", lineas: [], licencias: [], extras: [], recurrentes: [], nota: "", anchoRecurrente: "normal" },
    /* ⚠ Rótulos HISTÓRICOS declarados a propósito: hay propuestas de sitio web PUBLICADAS
       que dicen "Inversión única — Fase 1" y "Rango Fase 1", y `configForSnapshot` resuelve
       por key contra la config viva → estrenan este renderer. Sin esta declaración
       heredarían los genéricos y al cliente le cambiaría el rótulo del documento que ya
       tiene. Los valores son claves de i18n, no literales: el documento se traduce. */
    invest: { servicios: "inversionFase", totalServicios: "rangoFase" },
    agentHint: "(No la genera el agente: los montos los escribe Ventas.)",
    brief:
      "Inversión — la escribe VENTAS a mano, el agente NO la genera. `moneda`: el código de la moneda ('USD'). `lineas`: los servicios de Smarteam (diseño, desarrollo, migración, QA), una por concepto. `licencias`: lo que se le paga a un tercero (licencia del Content Hub, herramientas), aparte. En las dos, el `monto` es SOLO el número o el rango ('$1,800', '$5,600–6,650'): el sistema los suma y muestra los subtotales y el total general, así que un monto con texto adentro ('$1,800 por página', 'Incluido') NO entra en la suma y aparece marcado como pendiente. Sin precio todavía → dejá el monto vacío. `extras` (opcionales) y `recurrentes` (mensuales) se muestran pero NO suman. Impuestos y condiciones van en `nota`. `anchoRecurrente`: 'ancho' hace la card mensual más grande.",
    schema: { type: "object", properties: {} },
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
      "Por qué Smarteam: `cards` (hasta 4) con credenciales y diferenciales relevantes para ESTE proyecto — 'HubSpot Partner Elite' y '+200 proyectos, +8 países LATAM' son fijas; sumá referencia sectorial o equipo solo si hay evidencia. `siguientePaso`: qué sigue si avanzan (ej. sesión de arquitectura / firma), honesto y sin venderte de más. `buttonLabel`: 'Agendar siguiente paso'.",
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
