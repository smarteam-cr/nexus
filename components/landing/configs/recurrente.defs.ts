/**
 * components/landing/configs/recurrente.defs.ts — LA PROPUESTA DE UN SERVICIO RECURRENTE (server-safe, sin React).
 *
 * (Roadmap «La siguiente serie», iniciativa 3, paso 2, 2026-10-18.) Nace de lo que Ventas ya le vendió a mano a Cayalá y
 * a Grupo Inve con secciones HTML personalizadas: qué contiene el acuerdo, cómo opera (cadencia y gobierno), la
 * metodología (el ciclo de SmartLoop), el nivel de servicio, el antes y después, y la inversión mensual. Ahora son
 * secciones del motor `.stl`: salen bien en el PDF, se mueven y se ocultan, y la que trae datos del catálogo la escribe
 * Nexus.
 *
 * ⭐ LO QUE ES UN COMPROMISO LO ESCRIBE NEXUS, NO EL AGENTE. La cadencia y las rutinas (`operacion`), el ciclo
 * (`metodologia`) y el nivel de servicio (`nivel_servicio`) salen del catálogo de servicios (lib/servicios/catalogo.ts):
 * son `agentGenerated:false` y el generate los siembra cuando están vacíos (`seccionesDelServicio`). Después los ajusta
 * Ventas por cliente y una regeneración no los pisa. Un tiempo de respuesta inventado por un modelo, en un documento
 * que se firma, es justo lo que no puede pasar.
 *
 * Reusa lo que ya existe: la portada, el antes y después, los casos de uso, la inversión, la forma de pago, el partner y
 * el cierre son las mismas defs de la propuesta de HubSpot; «qué contiene el acuerdo» es la grilla de tarjetas con
 * ícono del catálogo de secciones creables.
 */
import type { BCSectionDef } from "./business-case.defs";
import { BC_SECTION_DEFS } from "./business-case.defs";
import { USE_CASES_DEF } from "./shared-sections.defs";
import { PROSA_EMPTY, PROSA_SCHEMA, TARJETAS_TYPE } from "@/lib/landing/catalogo-de-secciones";

const str = { type: "string" } as const;
function arrayOf(props: Record<string, unknown>, required: string[]) {
  return { type: "array", items: { type: "object", properties: props, required } } as const;
}

/** Los `sectionType` propios de esta plantilla (sus renderers: components/landing/sections-recurrente.tsx). */
export const OPERACION_TYPE = "operacion_servicio";
export const CICLO_TYPE = "ciclo_servicio";
export const NIVEL_TYPE = "nivel_servicio";

/** Las keys que Nexus siembra desde el catálogo cuando están vacías. */
export const KEYS_DEL_CATALOGO = ["operacion", "metodologia", "nivel_servicio"] as const;

function base(key: string): BCSectionDef {
  const d = BC_SECTION_DEFS.find((x) => x.key === key);
  if (!d) throw new Error(`La propuesta de HubSpot no declara la sección «${key}».`);
  return d;
}

export const OPERACION_SCHEMA = {
  type: "object",
  properties: {
    intro: str,
    rutinas: arrayOf({ titulo: str, cada: str, detalle: str }, ["titulo"]),
    nota: str,
  },
  required: ["rutinas"],
} as const;

export const CICLO_SCHEMA = {
  type: "object",
  properties: {
    intro: str,
    etapas: arrayOf({ titulo: str, detalle: str }, ["titulo"]),
    nota: str,
  },
  required: ["etapas"],
} as const;

export const NIVEL_SCHEMA = {
  type: "object",
  properties: {
    intro: str,
    niveles: arrayOf({ prioridad: str, tiempo: str, detalle: str }, ["prioridad", "tiempo"]),
    nota: str,
  },
  required: ["niveles"],
} as const;

export const RECURRENTE_SECTION_DEFS: BCSectionDef[] = [
  {
    ...base("hero"),
    brief:
      "Cabecera de la propuesta de un SERVICIO RECURRENTE (dark). `headline`: '[Verbo de continuidad] la [operación/evolución] de [Nombre cliente]' — es un servicio que se hace todos los meses, no un proyecto que se entrega una vez. `subhead`: una frase con el problema de fondo y lo que cambia al tener capacidad continua. `tags`: 3 a 4 chips (el servicio, la cadencia y lo que más le importa al cliente). Fuente: del transcript y del servicio elegido.",
  },
  {
    ...base("antes_despues"),
    brief:
      "Antes vs. después: cómo opera hoy (`before`) y cómo opera con el servicio recurrente (`after`).\n\nESCUETO, se presenta proyectado: **MÁXIMO 4 puntos por columna** y **MÁXIMO 14 palabras cada uno**, de una sola línea y sin punto final. Las dos listas tienen la misma cantidad de puntos y el de 'después' responde al de 'antes' en su misma posición. El contraste es de MODELO: capacidad que depende de la disponibilidad interna contra capacidad continua y priorizada. Fuente: del transcript; sin prometer lo que no se discutió.",
  },
  {
    key: "acuerdo",
    canvasLabel: "Qué contiene el acuerdo",
    label: "Qué contiene el acuerdo",
    eyebrow: "El servicio",
    theme: "light",
    sectionType: TARJETAS_TYPE,
    empty: PROSA_EMPTY,
    agentHint: "Lo que incluye el servicio, en 4 a 6 tarjetas, aterrizado a este cliente.",
    brief:
      "Qué contiene el acuerdo. `intro`: una frase que dice para qué es la capacidad continua para ESTE cliente. `items`: de 4 a 6 tarjetas con lo que incluye el servicio —parte de la lista «Qué incluye» del servicio elegido y aterrízala a las áreas y prioridades del cliente—; `title` de 2 a 5 palabras y `detail` de UNA línea. ⛔ No prometas horas, tiempos ni precios: los tiempos van en el nivel de servicio y los montos en la inversión.",
    schema: PROSA_SCHEMA as unknown as Record<string, unknown>,
  },
  {
    key: "operacion",
    canvasLabel: "Cómo opera",
    label: "Cómo opera el servicio",
    eyebrow: "Cadencia y gobierno",
    theme: "soft",
    sectionType: OPERACION_TYPE,
    agentGenerated: false,
    reescritaPorNexus: true,
    tip: "La escribe Nexus desde el catálogo del servicio (cadencia y reuniones fijas). Ajústala para este cliente.",
    empty: { intro: "", rutinas: [], nota: "" },
    agentHint: "(No la genera el agente: sale del catálogo del servicio.)",
    brief:
      "Cómo opera el servicio: la cadencia y las reuniones fijas, con quién y para qué. La escribe Nexus desde el catálogo de servicios; Ventas ajusta los participantes del cliente y la nota de gobierno.",
    schema: OPERACION_SCHEMA as unknown as Record<string, unknown>,
  },
  {
    key: "metodologia",
    canvasLabel: "Cómo trabajamos",
    label: "Cómo trabajamos",
    eyebrow: "Metodología",
    theme: "light",
    sectionType: CICLO_TYPE,
    agentGenerated: false,
    reescritaPorNexus: true,
    tip: "Las etapas del ciclo del servicio, como un ciclo. Solo la llevan los servicios que avanzan por ciclos (SmartLoop).",
    empty: { intro: "", etapas: [], nota: "" },
    agentHint: "(No la genera el agente: sale del catálogo del servicio.)",
    brief:
      "Las etapas del ciclo del servicio, dichas para el cliente. La escribe Nexus desde el catálogo; sin ciclo (un servicio sin etapas), la sección queda vacía y no se muestra.",
    schema: CICLO_SCHEMA as unknown as Record<string, unknown>,
  },
  USE_CASES_DEF,
  {
    key: "nivel_servicio",
    canvasLabel: "Nivel de servicio",
    label: "Nivel de servicio",
    eyebrow: "SLA",
    theme: "light",
    sectionType: NIVEL_TYPE,
    agentGenerated: false,
    reescritaPorNexus: true,
    tip: "Los tiempos de respuesta por prioridad. Los siembra Nexus desde el catálogo; los ajusta Ventas.",
    empty: { intro: "", niveles: [], nota: "" },
    agentHint: "(No la genera el agente: sale del catálogo del servicio.)",
    brief:
      "Nivel de servicio: cuánto tarda Smarteam en responder según la prioridad. Lo siembra Nexus desde el catálogo; Ventas lo ajusta por cliente. Es un compromiso: el agente nunca lo escribe.",
    schema: NIVEL_SCHEMA as unknown as Record<string, unknown>,
  },
  {
    ...base("inversion"),
    label: "Inversión mensual",
    brief:
      "Inversión — la escribe VENTAS a mano, el agente NO la genera. Es un servicio recurrente: marca como MENSUAL cada línea que se cobra todos los meses (el cierre muestra «Pago único» y «Por mes» por separado). `lineas`: el servicio de Smarteam; `licencias`: lo que se le paga a un tercero, aparte. Impuestos y condiciones van en `nota`.",
  },
  base("partner"),
  base("cta"),
];
