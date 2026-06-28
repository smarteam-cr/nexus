/**
 * components/landing/configs/business-case.defs.ts
 *
 * Metadatos de las secciones del Business Case SIN componentes (server-safe): key,
 * label, eyebrow, theme, JSON Schema (para el agente), agentHint, `brief` (la guía
 * del spec — editable en el editor, leída por el agente) y `empty`. Se separa de
 * business-case.ts (que ata los componentes client) para que el agente —código
 * server— pueda importar solo esto sin arrastrar React.
 *
 * Estructura HubSpot-específica del spec de 9 secciones. Las `key` matchean
 * BUSINESS_CASE_CANVAS.sections (lib/canvas/canvas-defs.ts).
 */
export interface BCSectionDef {
  key: string;
  label: string;       // título grande de la sección (no-selfTitled)
  eyebrow?: string;    // categoría chica arriba del título
  theme: "dark" | "light" | "soft";
  backdrop?: boolean;
  selfTitled?: boolean;
  schema: Record<string, unknown>;
  agentHint: string;   // instrucción base (fallback); el `brief` la gana
  brief: string;       // guía del spec (descripción + regla "Fuente:") — editable + leída por el agente
  empty: unknown;
}

const str = { type: "string" } as const;
const strArray = { type: "array", items: { type: "string" } } as const;
const investLine = { type: "object", properties: { monto: str, detalle: str } } as const;
function arrayOf(props: Record<string, unknown>, required: string[]) {
  return { type: "array", items: { type: "object", properties: props, required } } as const;
}

export const BC_SECTION_DEFS: BCSectionDef[] = [
  {
    key: "hero",
    label: "Cabecera del business case",
    theme: "dark",
    backdrop: true,
    selfTitled: true,
    empty: { headline: "", subhead: "", tags: [] },
    agentHint: "Encabezado del caso (titular + subtítulo + tags de hubs/integración/diferenciador).",
    brief:
      "Cabecera del business case (dark, con logos cliente × Smarteam × HubSpot). `headline`: '[Verbo de transformación] la [operación/experiencia/proceso] de [Nombre cliente]'. `subhead`: una frase que resume el dolor central y la apuesta. `tags`: 3 a 4 chips (hubs involucrados + integración clave + elemento diferenciador). Fuente: extraé del transcript el nombre del cliente, su industria, los hubs discutidos y la frase del dolor principal.",
    schema: { type: "object", properties: { headline: str, subhead: str, tags: strArray }, required: ["headline", "subhead"] },
  },
  {
    key: "dolores",
    label: "Los puntos de dolor reales",
    eyebrow: "Diagnóstico",
    theme: "light",
    empty: { items: [] },
    agentHint: "3 a 6 dolores concretos del cliente, con su lenguaje.",
    brief:
      "Los puntos de dolor reales: 3 a 6 problemas específicos del cliente tal como surgieron en la conversación. No genéricos — con el lenguaje del prospecto. Cada item: nombre del dolor + descripción en 1-2 líneas (impacto medible si se mencionó: tiempo, dinero, fricción). Fuente: buscá quejas explícitas en el transcript — 'manual', 'no tenemos visibilidad', 'perdemos tiempo en', 'el equipo no sabe'.",
    schema: { type: "object", properties: { items: arrayOf({ title: str, detail: str }, ["title", "detail"]) }, required: ["items"] },
  },
  {
    key: "antes_despues",
    label: "Antes vs. después",
    eyebrow: "Qué cambia",
    theme: "soft",
    empty: { before: [], after: [] },
    agentHint: "Contraste directo Hoy vs Con HubSpot + Smarteam (dos listas).",
    brief:
      "Antes vs. después: contraste directo entre el estado actual (`before` = 'Hoy') y el estado objetivo (`after` = 'Con HubSpot + Smarteam'). Concreto, no aspiracional. Cada punto del 'después' responde directamente a uno del 'antes'. Fuente: del transcript; sin prometer lo que no se discutió.",
    schema: { type: "object", properties: { before: strArray, after: strArray }, required: ["before", "after"] },
  },
  {
    key: "solucion",
    label: "Qué se implementa",
    eyebrow: "Solución propuesta",
    theme: "light",
    empty: { hubs: "", integraciones: "", casosDeUso: "", usuarios: "" },
    agentHint: "Hubs + integraciones + casos de uso + usuarios afectados.",
    brief:
      "Qué se implementa (no una lista de features — cómo conecta el proceso del cliente). `hubs`: Sales / Marketing / Service / Data Hub según el transcript. `integraciones`: ERP / WhatsApp / sistema existente mencionado. `casosDeUso`: pipeline comercial, seguimiento, automatización, reportería. `usuarios`: roles afectados (vendedores, gerencia, CS). Fuente: si se mencionó un sistema específico (SAP, Oracle, INCONCERT, Dynamics) → va en integraciones clave.",
    schema: { type: "object", properties: { hubs: str, integraciones: str, casosDeUso: str, usuarios: str }, required: ["hubs"] },
  },
  {
    key: "roi",
    label: "Números que respaldan la decisión",
    eyebrow: "Impacto / ROI",
    theme: "dark",
    empty: { metrics: [] },
    agentHint: "4 métricas con base en el transcript (value + label).",
    brief:
      "ROI / impacto financiero: hasta 4 métricas que respaldan la decisión, con base en el transcript (volumen de ventas, equipo, tiempo de proceso). Ej.: '[X]%' reducción en [proceso], '[N]h' ahorradas por [rol]/semana, '$[X]k' valor estimado de [oportunidad/año], '[N]' usuarios que impacta. Fuente / regla: si el número no se puede sustentar con algo del transcript, se omite o se presenta como rango estimado con supuesto explícito — NUNCA inventes cifras.",
    schema: { type: "object", properties: { metrics: arrayOf({ value: str, label: str }, ["value", "label"]) }, required: ["metrics"] },
  },
  {
    key: "cronograma",
    label: "Plan de implementación",
    eyebrow: "Timeline",
    theme: "light",
    empty: { phases: [] },
    agentHint: "3 a 5 fases con semanas según complejidad.",
    brief:
      "Plan de implementación en fases reales del proyecto, con semanas aproximadas según complejidad (campo `duration`, ej. 'Semanas 1-2'). Fases típicas: Kickoff y discovery, Implementación [hubs del caso], Piloto con usuarios clave, Go live y optimización. Fuente / regla: las semanas se infieren del número de hubs, integraciones y usuarios; integración ERP → sumar 4 semanas mínimo.",
    schema: { type: "object", properties: { phases: arrayOf({ name: str, detail: str, duration: str }, ["name", "detail"]) }, required: ["phases"] },
  },
  {
    key: "inversion",
    label: "Licencias + servicios Smarteam",
    eyebrow: "Inversión",
    theme: "soft",
    empty: { licenciasHubspot: { monto: "", detalle: "" }, implementacion: { monto: "", detalle: "" }, nota: "" },
    agentHint: "Separar licencias HubSpot de servicios Smarteam; sin inventar precios.",
    brief:
      "Inversión: separá SIEMPRE `licenciasHubspot` (Hubs × usuarios × descuento si aplica) de `implementacion` Smarteam (set up + onboarding + integraciones detectadas). Cada una: `monto` (o rango) + `detalle`. Fuente / regla: solo incluí montos si hay precio discutido en el transcript o se puede calcular del alcance; si no → poné 'A definir en propuesta formal' en `monto`, nunca números inventados.",
    schema: { type: "object", properties: { licenciasHubspot: investLine, implementacion: investLine, nota: str }, required: ["licenciasHubspot", "implementacion"] },
  },
  {
    key: "partner",
    label: "Por qué Smarteam",
    eyebrow: "Partner",
    theme: "light",
    empty: { credencial: "HubSpot Partner Elite", experiencia: "+200 proyectos, +8 países LATAM", referenciaSectorial: "", equipo: "" },
    agentHint: "Credencial + experiencia (fijos) + referencia sectorial + equipo.",
    brief:
      "Por qué Smarteam. `credencial`: 'HubSpot Partner Elite' (fijo en todos los casos). `experiencia`: '+200 proyectos, +8 países LATAM' (fijo). `referenciaSectorial`: cliente de referencia en una industria similar al prospecto, si existe. `equipo`: nombres del equipo asignado si se mencionaron en la llamada. Fuente: credencial y experiencia son fijas; referencia y equipo solo si hay evidencia.",
    schema: { type: "object", properties: { credencial: str, experiencia: str, referenciaSectorial: str, equipo: str }, required: ["credencial", "experiencia"] },
  },
  {
    key: "cta",
    label: "Llamado a la acción",
    theme: "dark",
    selfTitled: true,
    empty: { headline: "", subhead: "", buttonLabel: "Agendar siguiente paso" },
    agentHint: "Cierre corto + CTA.",
    brief:
      "Llamado a la acción (dark, cierre narrativo corto). `headline`: 'Estamos listos para iniciar con [nombre cliente]'. `subhead`: una frase de cierre que retoma el dolor principal y la apuesta. `buttonLabel`: 'Agendar siguiente paso'.",
    schema: { type: "object", properties: { headline: str, subhead: str, buttonLabel: str }, required: ["headline", "subhead", "buttonLabel"] },
  },
];

export const BC_DEF_BY_KEY: Record<string, BCSectionDef> = Object.fromEntries(
  BC_SECTION_DEFS.map((d) => [d.key, d]),
);
