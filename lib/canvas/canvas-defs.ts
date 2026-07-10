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

// ── Canvas Handoff (traspaso Sales→CS) ────────────────────────────────────────
// YA NO se crea con createDefaultCanvases: el handoff es una entidad cliente-level
// (model Handoff) que arranca el proyecto, y su canvas lo monta el FLUJO de
// creación de handoffs (createHandoffCanvas, Fase 4). Se mantiene la definición
// acá como fuente ÚNICA de las 10 secciones — el agente "Handoff Sales→CS" escribe
// en ellas vía AGENT_GROUP_TO_CANVAS. Cada sección 1:1 con una card del agente.
export const HANDOFF_CANVAS: CanvasDefinition = {
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
    name: "Diagnóstico",
    isDefault: false,
    order: 2,
    sections: [
      { key: "contexto_alcance", label: "Contexto y alcance" },
      { key: "estado_actual", label: "Estado actual (Current State)" },
      { key: "estado_deseado", label: "Estado deseado (Desired State)" },
      { key: "gap_analysis", label: "Gap Analysis" },
      { key: "causa_raiz", label: "Análisis de Causa Raíz" },
      { key: "impacto_gap", label: "Impacto del Gap" },
      { key: "recomendaciones", label: "Recomendaciones priorizadas" },
      { key: "proximos_pasos", label: "Próximos pasos / Caso de Uso propuesto" },
    ],
  },
  {
    name: "Planificación",
    isDefault: false,
    order: 3,
    sections: [
      { key: "arquitectura_solucion", label: "Arquitectura de la solución" },
      { key: "roadmap", label: "Roadmap de implementación" },
      { key: "definicion_procesos", label: "Definición de procesos" },
      { key: "metricas_exito", label: "Métricas de éxito" },
    ],
  },
  {
    // Cronograma: editor del ProjectTimeline (fases/semanas/sesiones). NO tiene
    // CanvasSection — lo respalda ProjectTimeline (fuente única; el Kickoff lo
    // refleja). Render especial en ProjectCanvasPanel (branch name==="Cronograma").
    name: "Cronograma",
    isDefault: false,
    order: 0,
    sections: [],
  },
];

/** Map from agentGroup to canvas name for routing cards/blocks.
 *  Fuente ÚNICA — app/api/clients/[id]/analyze/route.ts la importa (vía
 *  default-canvases.ts, que la re-exporta).
 *  `handoff` SE MANTIENE: el agente sigue escribiendo al canvas "Handoff" del
 *  proyecto, que ahora lo crea el flujo de handoff (createHandoffCanvas). */
export const AGENT_GROUP_TO_CANVAS: Record<string, string> = {
  diagnostico: "Diagnóstico",
  planificacion: "Planificación",
  handoff: "Handoff",
  kickoff: "Kickoff",
  businesscase: "Business Case",
  // D.1: el canvas "Cronograma" no tiene secciones → resolver targetCanvasId acá
  // evita que analyze inyecte instrucciones de formato cards al prompt del agente
  // de detalle (la persistencia real va a ProjectTimeline, no a bloques).
  cronograma: "Cronograma",
};

/** Definición canónica del canvas Kickoff (fuente única del seed, la reconciliación y el backfill). */
export const KICKOFF_CANVAS: CanvasDefinition = DEFAULT_PROJECT_CANVASES.find((c) => c.name === "Kickoff")!;

/**
 * Secuencia destino de las secciones de un canvas Kickoff: parte del orden VIVO
 * (`existingKeys`, tal como las ve el CSE — que puede haberlas reordenado con drag)
 * y agrega cada key canónica faltante justo detrás de su predecesora canónica
 * presente. Si ninguna predecesora existe, va al principio.
 *
 * PURA: la comparten `reconcileKickoffCanvasSections` (runtime, al regenerar) y
 * `scripts/backfill-kickoff-sections.ts` (los kickoffs viejos) → mismo resultado.
 * NUNCA quita keys: las secciones custom del CSE sobreviven en su lugar.
 */
export function kickoffSectionSequence(existingKeys: string[]): string[] {
  const canon = KICKOFF_CANVAS.sections.map((s) => s.key);
  const seq = [...existingKeys];
  for (const key of canon) {
    if (seq.includes(key)) continue;
    const canonIdx = canon.indexOf(key);
    let at = 0;
    for (let i = canonIdx - 1; i >= 0; i--) {
      const pos = seq.indexOf(canon[i]);
      if (pos !== -1) {
        at = pos + 1;
        break;
      }
    }
    seq.splice(at, 0, key);
  }
  return seq;
}
