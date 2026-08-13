/**
 * lib/canvas/canvas-defs.ts
 *
 * Definiciones PURAS de los canvases (sin Prisma) — datos compartibles entre
 * código de servidor y de cliente. Se separaron de `default-canvases.ts`
 * (que importa `prisma` → `pg`) para que componentes CLIENTE como
 * `app/agents/AgentsClient.tsx` puedan importar `AGENT_GROUP_TO_CANVAS` (vía
 * `lib/agents/catalog.ts`) sin arrastrar `pg`/`fs`/`net` al bundle del navegador.
 *
 * `default-canvases.ts` re-exporta todo lo de acá, así que los importadores de
 * servidor existentes siguen funcionando sin cambios.
 */

export type CanvasSectionDef = {
  key: string;
  label: string;
  /**
   * Data por defecto con la que se SIEMBRA el bloque de la sección (secciones
   * CURADAS por el CSE, ej. equipo/horarios/canales del Kickoff). Si está
   * presente, `createDefaultCanvases` crea un bloque CONFIRMED con esta data en
   * vez de dejar la sección vacía. JSON-serializable (se castea a Prisma.InputJsonValue).
   */
  defaultData?: Record<string, unknown>;
};

export type CanvasDefinition = {
  /**
   * IDENTIDAD de la pieza (lib/pieces/registry.ts). Es lo que se persiste en
   * `ProjectCanvas.slug` al crear y lo que resuelven agente/renderer/permiso/vista
   * externa. `name` es solo el rótulo visible.
   */
  slug: string;
  name: string;
  isDefault: boolean;
  order: number;
  sections: CanvasSectionDef[];
};

// Defaults de las secciones CURADAS del Kickoff (equipo/horarios/canales). Fuente
// ÚNICA — la usan el seed (createDefaultCanvases) y el backfill de proyectos viejos.
export const KICKOFF_CANALES_DEFAULT = {
  horario: "Lunes a viernes de 8 a.m. a 5 p.m.",
  canales: ["WhatsApp (grupos asignados)", "Correo electrónico", "Google Meet"],
  soporteEmail: "soporte@smarteamcr.com",
} as const;

// Default del CIERRE (CTA de cara al cliente, como el `cta` del Business Case). El
// CSE edita el titular/subtítulo y configura el botón (texto + enlace, ej. agenda o
// grupo). Fuente ÚNICA — la usan el seed, el backfill y el `empty` de kickoff.defs.
export const KICKOFF_CIERRE_DEFAULT = {
  eyebrow: "El siguiente paso",
  headline: "¡Estamos listos para empezar!",
  subhead:
    "Tu equipo de Smarteam ya tiene todo lo necesario para arrancar. Coordinamos la primera sesión y damos juntos el primer paso.",
  buttonLabel: "",
  buttonUrl: "",
  buttonTarget: "_blank",
} as const;

/* Default del CIERRE del canvas Entrega. A diferencia del kickoff —que invita a arrancar—
   éste cierra: agradece, deja el canal abierto y ofrece el paso siguiente. Fuente ÚNICA:
   la usan el seed y el `empty` de entrega.defs. */
export const ENTREGA_CIERRE_DEFAULT = {
  eyebrow: "Gracias",
  headline: "Hasta acá llega este proyecto — y acá empieza lo que sigue",
  subhead:
    "Tu equipo de Smarteam queda disponible para acompañar la operación. Cualquier duda sobre lo entregado, escribinos.",
  buttonLabel: "",
  buttonUrl: "",
  buttonTarget: "_blank",
} as const;

// Default del CIERRE del canvas Desarrollo (notas de cierre + botón opcional, ej.
// enlace al repo / doc técnica / agenda de arranque con el dev). Fuente ÚNICA — la
// usan createDesarrolloCanvas, la reconciliación y el `empty` de desarrollo.defs.
export const DESARROLLO_CIERRE_DEFAULT = {
  eyebrow: "Siguiente paso",
  headline: "Requerimiento listo para estimar",
  subhead: "",
  buttonLabel: "",
  buttonUrl: "",
  buttonTarget: "_blank",
} as const;

// Default del CIERRE del canvas Exploración. OJO: este documento es INTERNO (no lo ve
// el cliente), así que el "botón" apunta a recursos del equipo (carpeta de notas, doc
// de descubrimiento), nunca a una agenda de cara al cliente. Fuente ÚNICA — la usan
// createExploracionCanvas, la reconciliación y el `empty` de exploracion.defs.
export const EXPLORACION_CIERRE_DEFAULT = {
  eyebrow: "Cómo se cierra",
  headline: "Qué hacemos con lo que averigüemos",
  subhead:
    "Al cerrar cada sesión, mueve lo confirmado a «Lo que ya sabemos» y abre las preguntas nuevas que aparezcan.",
  buttonLabel: "",
  buttonUrl: "",
  buttonTarget: "_blank",
} as const;

// Default del CIERRE del canvas Diagnóstico (informe de cara al cliente). Fuente
// ÚNICA — la usan el seed/reconcile y el `empty` de diagnostico.defs.
export const DIAGNOSTICO_CIERRE_DEFAULT = {
  eyebrow: "El siguiente paso",
  headline: "De entender a construir",
  subhead:
    "Con este diagnóstico sobre la mesa, el siguiente paso es la planificación: cómo pasamos del nivel actual al que sigue.",
  buttonLabel: "",
  buttonUrl: "",
  buttonTarget: "_blank",
} as const;

// Default del CIERRE del canvas Planificación (documento que aprueba el cliente antes
// de habilitar el CRM). Fuente ÚNICA — seed/reconcile + `empty` de planificacion.defs.
export const PLANIFICACION_CIERRE_DEFAULT = {
  eyebrow: "Aprobación",
  headline: "Listo para construir",
  subhead:
    "Este plan define qué se construye y cómo se adopta. Con tu aprobación, arranca la configuración del CRM.",
  buttonLabel: "",
  buttonUrl: "",
  buttonTarget: "_blank",
} as const;

// Default del CIERRE del canvas Implementación (guía de construcción del CSE).
export const IMPLEMENTACION_CIERRE_DEFAULT = {
  eyebrow: "A construir",
  headline: "Listo para construir en el portal",
  subhead:
    "Con la arquitectura y los pipelines decididos, lo que sigue es ejecutarlo: Breeze lo que pueda, y el resto a mano.",
  buttonLabel: "",
  buttonUrl: "",
  buttonTarget: "_blank",
} as const;

// ── Canvas Handoff (traspaso Sales→CS) ────────────────────────────────────────
// YA NO se crea con createDefaultCanvases: el handoff es una entidad cliente-level
// (model Handoff) que arranca el proyecto, y su canvas lo monta el FLUJO de
// creación de handoffs (createHandoffCanvas, Fase 4). Se mantiene la definición
// acá como fuente ÚNICA de las 10 secciones — el agente "Handoff Sales→CS" escribe
// en ellas vía AGENT_GROUP_TO_CANVAS. Cada sección 1:1 con una card del agente.
export const HANDOFF_CANVAS: CanvasDefinition = {
  slug: "handoff",
  name: "Handoff",
  isDefault: false,
  order: 0,
  sections: [
    { key: "fecha_inicio_kickoff", label: "Fecha de inicio / Kickoff" },
    { key: "acuerdos_promesas",    label: "Acuerdos clave y promesas especiales" },
    { key: "alcance_contratado",   label: "¿Qué vendimos?" },
    { key: "desarrollo",           label: "Integraciones, migraciones y desarrollo" },
    { key: "motivacion_decision",  label: "¿Por qué vendimos? (por qué nos eligieron)" },
    { key: "dolor_principal",      label: "Dolor principal" },
    { key: "expectativas",         label: "Expectativas del cliente" },
    { key: "stakeholders_handoff", label: "Stakeholders clave" },
    { key: "estado_en_flight",     label: "Proyectos y avances en curso" },
    { key: "riesgos_banderas",     label: "Riesgos y banderas rojas" },
  ],
};

// ── Canvas Business Case (Ventas) ─────────────────────────────────────────────
// LEGACY/informativo: la fuente de composición del BC ahora es el registry de
// templates (components/landing/configs/templates.defs.ts) — createBusinessCaseCanvas
// siembra desde BC_TEMPLATES[templateId], no desde acá. Se conserva como referencia
// de las 9 secciones históricas de hubspot_v1 (mismas keys y rótulos internos).
export const BUSINESS_CASE_CANVAS: CanvasDefinition = {
  slug: "business-case",
  name: "Business Case",
  isDefault: true,
  order: 0,
  sections: [
    { key: "hero",          label: "Encabezado" },
    { key: "dolores",       label: "Dolores y retos" },
    { key: "antes_despues", label: "Antes y después" },
    { key: "solucion",      label: "Solución propuesta" },
    { key: "roi",           label: "Impacto y ROI" },
    { key: "cronograma",    label: "Plan de implementación" },
    { key: "inversion",     label: "Inversión" },
    { key: "partner",       label: "Sobre Smarteam" },
    { key: "cta",           label: "Próximos pasos" },
  ],
};

// Orden de presentación en el dropdown: Cronograma → Kickoff → Diagnóstico →
// Planificación (pedido del usuario). El array YA NO es la fuente del `order`: cada
// canvas lleva su `order` explícito abajo. El ancla/default (isDefault → fallback
// cuando no hay canvas elegido + no borrable desde la UI) sigue siendo KICKOFF; el
// canvas que se abre al entrar es el de menor `order` (Cronograma).
export const DEFAULT_PROJECT_CANVASES: CanvasDefinition[] = [
  {
    // Kickoff (Fase A): landing de arranque DE CARA AL CLIENTE. El cronograma NO
    // es una sección — la plantilla lo pinta desde ProjectTimeline. ANCLA/default
    // del proyecto (isDefault → fallback cuando no hay canvas seleccionado + no
    // borrable desde la UI).
    slug: "kickoff",
    name: "Kickoff",
    isDefault: true,
    order: 1,
    sections: [
      { key: "bienvenida",     label: "Bienvenida y contexto" },
      { key: "objetivos",      label: "Objetivos del proyecto" },
      { key: "hoy_vs_sistema", label: "Del hoy al nuevo sistema" },
      { key: "alcance",        label: "Alcance: qué incluye" },
      // Secciones CURADAS por el CSE (el agente de IA NO las genera): datos
      // estructurados/interactivos. Se siembran con `defaultData` → sobreviven a
      // las regeneraciones del kickoff (que solo tocan sus 6 keys de prosa).
      { key: "equipo",         label: "Equipo del proyecto",       defaultData: { members: [] } },
      { key: "tu_rol",         label: "Lo que necesitamos de tu equipo" },
      { key: "metricas_exito", label: "Cómo mediremos el éxito" },
      { key: "horarios",       label: "Sesiones y horarios",       defaultData: { intro: "", options: [], sessions: [] } },
      { key: "canales",        label: "Canales de atención",       defaultData: { ...KICKOFF_CANALES_DEFAULT } },
      // Cronograma y procesos NO llevan bloque: su contenido sale de ProjectTimeline y de
      // los flowcharts del cliente (`ctxDriven` en kickoff.defs). Existen como CanvasSection
      // solo para tener un `order` propio → el CSE puede arrastrarlas como a cualquier otra.
      { key: "cronograma",     label: "Cronograma del proyecto" },
      { key: "procesos",       label: "Nuestros procesos" },
      { key: "proximos_pasos", label: "Próximos pasos" },
      // Cierre = CTA de cara al cliente (curada por el CSE; el agente NO la genera).
      // Data-driven pero se pinta al final full-bleed (pinned/ctxDriven en kickoff.defs).
      { key: "cierre",         label: "Cierre y llamado a la acción", defaultData: { ...KICKOFF_CIERRE_DEFAULT } },
    ],
  },
  {
    slug: "diagnosis",
    name: "Diagnóstico",
    isDefault: false,
    order: 2,
    // 2026-07-25 — el Diagnóstico pasó al motor de landings (informe de cara al
    // cliente). Se SUMAN hero/escala/cierre; las 8 keys legacy SE CONSERVAN para que el
    // contenido markdown viejo siga visible (tres quedan solo-lectura en las defs:
    // estado_deseado, impacto_gap, proximos_pasos). Orden = el del informe.
    sections: [
      { key: "diagnostico", label: "Diagnóstico de rendimiento" },
      { key: "contexto_alcance", label: "Qué miramos y con qué fuentes" },
      { key: "estado_actual", label: "Cómo operás hoy — y cómo vas a operar" },
      { key: "estado_deseado", label: "Estado deseado" },
      { key: "escala", label: "Dónde estás en la escala" },
      { key: "causa_raiz", label: "Qué explica estos resultados" },
      { key: "gap_analysis", label: "Qué te separa del siguiente nivel" },
      { key: "impacto_gap", label: "Impacto del gap" },
      { key: "recomendaciones", label: "Qué hacemos con esto" },
      { key: "proximos_pasos", label: "Próximos pasos" },
      { key: "cierre", label: "El siguiente paso", defaultData: { ...DIAGNOSTICO_CIERRE_DEFAULT } },
    ],
  },
  {
    slug: "planning",
    name: "Planificación",
    isDefault: false,
    order: 3,
    // 2026-07-25 — la Planificación pasó al motor de landings. Se SUMAN hero, etapas
    // del ciclo de vida del CRM, rutinas de adopción, plan de despliegue (condicional:
    // el agente la deja vacía si el equipo es chico) y cierre. Las 4 keys legacy SE
    // CONSERVAN para que el contenido viejo siga visible.
    sections: [
      { key: "planificacion", label: "Plan de implementación" },
      { key: "arquitectura_solucion", label: "Arquitectura de la solución" },
      { key: "roadmap", label: "Hoja de ruta" },
      { key: "definicion_procesos", label: "Procesos rediseñados" },
      { key: "ciclo_vida_crm", label: "Etapas del ciclo de vida" },
      { key: "rutinas_adopcion", label: "Rutinas de adopción" },
      { key: "plan_despliegue", label: "Plan de despliegue por olas" },
      { key: "metricas_exito", label: "Métricas de éxito" },
      { key: "cierre", label: "Aprobación", defaultData: { ...PLANIFICACION_CIERRE_DEFAULT } },
    ],
  },
  {
    // Cronograma: editor del ProjectTimeline (fases/semanas/sesiones). NO tiene
    // CanvasSection — lo respalda ProjectTimeline (fuente única; el Kickoff lo
    // refleja). Render especial en ProjectCanvasPanel (branch name==="Cronograma").
    slug: "timeline",
    name: "Cronograma",
    isDefault: false,
    order: 0,
    sections: [],
  },
  {
    // Exploración: guía INTERNA de descubrimiento del negocio. Canvas de primera
    // clase (modelo Kickoff): aparece en el dropdown y su agente se corre desde el
    // header del canvas. INTERNO ≠ on-demand — sigue sin superficie externa (no hay
    // /external/exploracion ni publish-exploracion; `exploracion-internal.test.ts`
    // congela esa ausencia) y se renderiza con la paleta gris `.stl-internal`.
    //
    // `order: 4` (al final) a propósito: Cronograma/Kickoff/Diagnóstico/Planificación
    // ya ocupan 0-3 EN LA DB de los ~113 proyectos. Renumerar acá solo afectaría a los
    // proyectos nuevos y haría divergir el orden del dropdown entre viejos y nuevos;
    // y empatar en 2 con Diagnóstico daría un orden no determinístico ahora que ambos
    // se crean en el mismo `createMany` (ya no hay desempate por `createdAt`).
    // Fuente ÚNICA de sus secciones (keys/labels 1:1 con EXPLORACION_SECTION_DEFS del
    // motor). Solo `cierre` es curada (defaultData).
    slug: "exploration",
    name: "Exploración",
    isDefault: false,
    order: 4,
    sections: [
      { key: "exploracion",   label: "Qué hay que entender de este proyecto" },
      { key: "ya_sabemos",    label: "Lo que ya sabemos" },
      { key: "sin_verificar", label: "Lo que damos por supuesto" },
      { key: "sesiones",      label: "Plan de sesiones" },
      { key: "personas",      label: "A quién involucrar" },
      { key: "profundidad",   label: "Qué hay que entender a fondo" },
      { key: "cierre",        label: "Cómo se cierra", defaultData: { ...EXPLORACION_CIERRE_DEFAULT } },
    ],
  },
];

/** agentGroup -> SLUG de la pieza destino (lib/pieces/registry.ts) donde el agente
 *  escribe sus cards/bloques. Mapeaba al NOMBRE visible, y por eso renombrar un
 *  canvas dejaba al agente escribiendo en la nada (targetCanvasId null, en silencio).
 *  Fuente ÚNICA — app/api/clients/[id]/analyze/route.ts la importa (vía
 *  default-canvases.ts, que la re-exporta).
 *  `handoff` SE MANTIENE: el agente sigue escribiendo al canvas "Handoff" del
 *  proyecto, que ahora lo crea el flujo de handoff (createHandoffCanvas). */
export const AGENT_GROUP_TO_CANVAS: Record<string, string> = {
  implementacion: "implementation",
  entrega: "delivery",
  diagnostico: "diagnosis",
  planificacion: "planning",
  handoff: "handoff",
  kickoff: "kickoff",
  // Requerimiento técnico: canvas ON-DEMAND (solo si el handoff detecta trabajo técnico).
  // Lo crea createDesarrolloCanvas; el agente "agent-desarrollo-canvas" escribe en él.
  desarrollo: "tech-requirements",
  // Exploración del negocio: canvas DEFAULT e INTERNO (se pre-crea con el proyecto y
  // vive en el dropdown, como Kickoff). El agente "agent-exploracion-canvas" escribe
  // en él, disparado desde el header del propio canvas (CANVAS_PRIMARY_AGENT).
  exploracion: "exploration",
  businesscase: "business-case",
  // D.1: el canvas "Cronograma" no tiene secciones → resolver targetCanvasId acá
  // evita que analyze inyecte instrucciones de formato cards al prompt del agente
  // de detalle (la persistencia real va a ProjectTimeline, no a bloques).
  cronograma: "timeline",
};

/** Definición canónica del canvas Kickoff (fuente única del seed, la reconciliación y el backfill). */
export const KICKOFF_CANVAS: CanvasDefinition = DEFAULT_PROJECT_CANVASES.find((c) => c.slug === "kickoff")!;

/**
 * Núcleo PURO de la secuencia destino de secciones de un canvas: parte del orden VIVO
 * (`existingKeys`, tal como las ve el CSE — que puede haberlas reordenado con drag) y
 * agrega cada key canónica faltante justo detrás de su predecesora canónica presente.
 * Si ninguna predecesora existe, va al principio. NUNCA quita keys: las secciones
 * custom del CSE sobreviven en su lugar.
 *
 * Vive UNA vez y lo envuelven los tres canvases reconciliables (kickoff, desarrollo,
 * exploración) — antes era el mismo algoritmo copiado por canvas.
 */
export function sectionSequence(canonKeys: string[], existingKeys: string[]): string[] {
  const seq = [...existingKeys];
  for (const key of canonKeys) {
    if (seq.includes(key)) continue;
    const canonIdx = canonKeys.indexOf(key);
    let at = 0;
    for (let i = canonIdx - 1; i >= 0; i--) {
      const pos = seq.indexOf(canonKeys[i]);
      if (pos !== -1) {
        at = pos + 1;
        break;
      }
    }
    seq.splice(at, 0, key);
  }
  return seq;
}

/**
 * Secuencia destino de las secciones de un canvas Kickoff.
 * La comparten `reconcileKickoffCanvasSections` (runtime, al regenerar) y
 * `scripts/backfill-kickoff-sections.ts` (los kickoffs viejos) → mismo resultado.
 */
export function kickoffSectionSequence(existingKeys: string[]): string[] {
  return sectionSequence(KICKOFF_CANVAS.sections.map((s) => s.key), existingKeys);
}

// ── Canvas Desarrollo (requerimiento técnico) ─────────────────────────────────
// Canvas ON-DEMAND: NO va en DEFAULT_PROJECT_CANVASES ni se crea con
// createDefaultCanvases. Lo monta createDesarrolloCanvas cuando el handoff detecta
// trabajo técnico (hasTechnicalScope). Fuente ÚNICA de sus secciones (keys/labels 1:1
// con DESARROLLO_SECTION_DEFS del motor). Solo `cierre` es curada (defaultData).
export const DESARROLLO_CANVAS: CanvasDefinition = {
  slug: "tech-requirements",
  name: "Desarrollo",
  isDefault: false,
  order: 0,
  sections: [
    { key: "requerimiento",    label: "Requerimiento técnico" },
    // ctxDriven (el dato vive en DevEstimate): su CanvasSection existe SOLO para llevar un
    // `order` arrastrable, igual que cronograma/procesos en el kickoff.
    { key: "estimacion",       label: "Estimación del equipo técnico" },
    { key: "retos_cliente",    label: "Retos del cliente" },
    { key: "criterios_exito",  label: "Criterios de éxito" },
    { key: "arquitectura",     label: "Arquitectura (IDs y dedup)" },
    { key: "relacion_objetos", label: "Relación entre objetos" },
    { key: "propiedades",      label: "Propiedades y campos" },
    { key: "comunicacion",     label: "Triggers y flujos" },
    { key: "cierre",           label: "Notas de cierre", defaultData: { ...DESARROLLO_CIERRE_DEFAULT } },
  ],
};

/** Secuencia destino de las secciones del canvas Desarrollo (orden vivo + inserta
 *  canónicas faltantes detrás de su predecesora). La usan
 *  reconcileDesarrolloCanvasSections y el backfill futuro. */
export function desarrolloSectionSequence(existingKeys: string[]): string[] {
  return sectionSequence(DESARROLLO_CANVAS.sections.map((s) => s.key), existingKeys);
}

// ── Canvas Exploración (descubrimiento del negocio del cliente) ───────────────
/** Definición canónica del canvas Exploración (fuente única del seed, la reconciliación
 *  y el backfill). Vive DENTRO de DEFAULT_PROJECT_CANVASES — es un canvas de primera
 *  clase (modelo Kickoff): se pre-crea con el proyecto y su agente se corre desde el
 *  header del canvas. INTERNO ≠ on-demand: sigue sin superficie externa. */
export const EXPLORACION_CANVAS: CanvasDefinition = DEFAULT_PROJECT_CANVASES.find((c) => c.slug === "exploration")!;

// ── Canvas Planificación (el plan que aprueba el cliente) ─────────────────────
export const PLANIFICACION_CANVAS: CanvasDefinition = DEFAULT_PROJECT_CANVASES.find((c) => c.slug === "planning")!;

/** Secuencia destino de las secciones del canvas Planificación. */
export function planificacionSectionSequence(existingKeys: string[]): string[] {
  return sectionSequence(PLANIFICACION_CANVAS.sections.map((s) => s.key), existingKeys);
}

// ── Canvas Diagnóstico (informe de rendimiento para el cliente) ───────────────
export const DIAGNOSTICO_CANVAS: CanvasDefinition = DEFAULT_PROJECT_CANVASES.find((c) => c.slug === "diagnosis")!;

/** Secuencia destino de las secciones del canvas Diagnóstico (orden vivo + inserta
 *  canónicas faltantes). La usan el reconcile y la activación de la pieza. */
export function diagnosticoSectionSequence(existingKeys: string[]): string[] {
  return sectionSequence(DIAGNOSTICO_CANVAS.sections.map((s) => s.key), existingKeys);
}

/** Secuencia destino de las secciones del canvas Exploración (orden vivo + inserta
 *  canónicas faltantes detrás de su predecesora). La usa
 *  reconcileExploracionCanvasSections. */
export function exploracionSectionSequence(existingKeys: string[]): string[] {
  return sectionSequence(EXPLORACION_CANVAS.sections.map((s) => s.key), existingKeys);
}

// ── Canvas Implementación (qué construir en HubSpot) ─────────────────────────
/**
 * La pieza donde el CSE ve QUÉ hay que construir en HubSpot, y desde donde salen los
 * prompts para que Breeze lo cree.
 *
 * ORDEN DEL CONTENIDO, y no es arbitrario: primero se resuelve la arquitectura (qué
 * propiedades, qué pipelines, qué objetos), y RECIÉN AHÍ valen los prompts. Pedirle a
 * Breeze que construya sin haber decidido la arquitectura es pedirle que la invente.
 *
 * Tiene sentido cuando ya se entendió al cliente — exploración y planificación hechas.
 * Eso NO se bloquea: la pieza lo avisa (lib/flow/piece-readiness.ts) y el CSE decide.
 *
 * Su agente (`agent-implementacion-canvas`) la genera con el motor de landings; el CSE
 * también puede activarla y llenarla a mano.
 */
export const IMPLEMENTACION_CANVAS: CanvasDefinition = {
  slug: "implementation",
  name: "Implementación",
  isDefault: false,
  order: 5,
  sections: [
    { key: "implementacion",           label: "Guía de construcción" },
    { key: "arquitectura_propiedades", label: "Arquitectura de propiedades" },
    { key: "pipelines",                label: "Pipelines y objetos" },
    { key: "procesos_marketing",       label: "Procesos de marketing" },
    { key: "prompts_breeze",           label: "Prompts para Breeze" },
    { key: "a_mano",                   label: "Lo que va a mano" },
    { key: "cierre",                   label: "A construir", defaultData: { ...IMPLEMENTACION_CIERRE_DEFAULT } },
  ],
};

export function implementacionSectionSequence(existingKeys: string[]): string[] {
  return sectionSequence(IMPLEMENTACION_CANVAS.sections.map((s) => s.key), existingKeys);
}

/**
 * ENTREGA — el documento con el que se cierra un proyecto (2026-08-12).
 *
 * Se le presenta y se le comparte al cliente, como el kickoff: cuenta qué se construyó, qué
 * se logró, cómo se cumplió el plan y qué sigue. Canvas ON-DEMAND: lo activa el CSE cuando
 * el proyecto llega a la entrega.
 *
 * ⚠ DOS SECCIONES NO LAS ESCRIBE EL AGENTE, y no es un detalle de implementación: es la
 * única promesa de honestidad del documento. `cumplimiento` y `pendientes` son NÚMEROS sobre
 * el proyecto del cliente —tareas hechas, fases cerradas, cuánto se corrió el cierre—, y las
 * calcula el runner desde el cronograma. El agente ni las ve, así que un número inventado
 * deja de ser posible por construcción y no por prompt. Ver components/landing/configs/entrega.defs.ts.
 *
 * ORDEN, y tampoco es arbitrario: primero QUÉ se construyó (alcance, logros), después CÓMO
 * se cumplió (el plan, el impacto) y al final QUÉ FALTA (pendientes, continuidad). Al revés
 * el documento arranca justificándose.
 */
export const ENTREGA_CANVAS: CanvasDefinition = {
  slug: "delivery",
  name: "Entrega",
  isDefault: false,
  order: 6,
  sections: [
    { key: "portada",      label: "Portada" },
    { key: "resumen",      label: "El antes y el después" },
    { key: "alcance",      label: "Qué quedó implementado" },
    { key: "logros",       label: "Objetivos alcanzados" },
    { key: "cumplimiento", label: "El plan, cumplido" },
    { key: "impacto",      label: "El impacto en el negocio" },
    { key: "pendientes",   label: "Qué queda abierto" },
    { key: "continuidad",  label: "Qué sigue" },
    { key: "cierre",       label: "Cierre", defaultData: { ...ENTREGA_CIERRE_DEFAULT } },
  ],
};

export function entregaSectionSequence(existingKeys: string[]): string[] {
  return sectionSequence(ENTREGA_CANVAS.sections.map((s) => s.key), existingKeys);
}

// ── Índice pieza → definición ────────────────────────────────────────────────
/**
 * De la IDENTIDAD de una pieza a su estructura. Es lo que faltaba para poder crear una
 * pieza cualquiera a mano: las definiciones estaban repartidas entre el array de las que
 * nacen con el proyecto y las constantes sueltas de las on-demand, sin nada que las una.
 *
 * El handoff queda afuera a propósito: no se activa desde el desplegable — lo monta el
 * flujo de handoffs, que además crea la entidad.
 */
export const CANVAS_DEF_BY_SLUG: Record<string, CanvasDefinition> = Object.fromEntries(
  [...DEFAULT_PROJECT_CANVASES, DESARROLLO_CANVAS, IMPLEMENTACION_CANVAS, ENTREGA_CANVAS].map((d) => [d.slug, d]),
);

/** La estructura de una pieza, o null si no es una pieza activable desde el desplegable. */
export function canvasDefForSlug(slug: string): CanvasDefinition | null {
  return CANVAS_DEF_BY_SLUG[slug] ?? null;
}
