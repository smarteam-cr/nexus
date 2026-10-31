/**
 * components/landing/configs/hoja-de-ruta.defs.ts
 *
 * Lado SERVER-SAFE del registry de la HOJA DE RUTA (catálogo n.º 16 y n.º 3 de docs/artefactos-sugeridos.md, Elías, 30 oct):
 * qué se va a hacer los próximos meses, en qué orden, qué quedó afuera y qué se decidió. Tipo nuevo, sin secciones
 * repetidas de otro artefacto, con el backlog y el registro de decisiones adentro. Sin componentes propios: las tablas son
 * las de una sección «Tabla» creada a mano.
 */
import type { BCSectionDef } from "./business-case.defs";
import type { BcTemplateDef } from "./templates.defs";
import { ADOPCION_DEF_BY_KEY, NO_INVENTES, seccionDeTabla } from "./adopcion.defs";
import { PLANIFICACION_HANDOFF_KEYS } from "./planificacion.defs";
import { heroTitleBrief } from "@/lib/landing/hero-title";

/** El cierre por defecto de la hoja de ruta. */
export const HOJA_DE_RUTA_CIERRE_DEFAULT = {
  eyebrow: "El siguiente paso",
  headline: "Lo revisamos en cada seguimiento",
  subhead: "Esta hoja cambia cuando cambia el negocio: la ajustamos juntos y dejamos escrito por qué.",
  buttonLabel: "",
  buttonUrl: "",
  buttonTarget: "_blank",
} as const;

export const COLUMNAS_DE_LOS_FRENTES = ["Frente", "Qué busca", "Quién lo lidera", "Estado"] as const;
export const COLUMNAS_DEL_HORIZONTE = ["Cuándo", "Qué entra", "Por qué ahora"] as const;
export const COLUMNAS_DEL_BACKLOG = ["Qué", "Valor", "Esfuerzo", "Quién lo pidió", "Estado"] as const;
export const COLUMNAS_DE_LO_DIFERIDO = ["Qué quedó para después", "Por qué", "Cuándo se retoma"] as const;
export const COLUMNAS_DE_LAS_DECISIONES = ["Decisión", "Quién la tomó", "Cuándo", "Qué cambia"] as const;
export const COLUMNAS_DE_LAS_HORAS = ["Período", "Horas contratadas", "Consumidas", "Saldo"] as const;

export const HOJA_DE_RUTA_SECTION_DEFS: BCSectionDef[] = [
  {
    ...ADOPCION_DEF_BY_KEY["adopcion"],
    key: "hoja_de_ruta",
    label: "Hoja de ruta",
    eyebrow: "Hoja de ruta",
    agentHint: "Título de la hoja + una bajada de qué período cubre y qué busca + chips de los frentes.",
    brief:
      heroTitleBrief("Hoja de ruta") +
      "Portada de la hoja de ruta. `headline`: patrón `Hoja de ruta: [cuenta] en [período]` ('Hoja de ruta: Grupo Inve este trimestre'). `subhead`: UNA frase en lenguaje llano de qué se busca. `tags`: 2-5 chips de los frentes. " +
      NO_INVENTES,
  },
  seccionDeTabla({
    key: "frentes",
    label: "Los frentes activos",
    eyebrow: "En qué estamos",
    columnas: COLUMNAS_DE_LOS_FRENTES,
    tip: "De uno a tres carriles: en qué se está trabajando de verdad, para qué y quién lo lidera.",
    agentHint: "Una fila por frente activo, de uno a tres si la fuente lo permite.",
    brief: "LOS FRENTES ACTIVOS: una fila por carril de trabajo. «Estado»: 'En curso', 'Por arrancar' o 'En pausa'. Máximo 5 filas.",
  }),
  seccionDeTabla({
    key: "horizonte",
    label: "Lo que viene",
    eyebrow: "El orden",
    theme: "soft",
    columnas: COLUMNAS_DEL_HORIZONTE,
    tip: "Qué entra en cada período y por qué ahora.",
    agentHint: "Una fila por período, en orden, con lo que entra y su porqué.",
    brief: "LO QUE VIENE, en orden. «Cuándo»: un período corto ('Este mes', 'Noviembre', 'Próximo trimestre'), nunca una fecha que la fuente no diga. 3 a 6 filas.",
  }),
  seccionDeTabla({
    key: "backlog",
    label: "El backlog",
    eyebrow: "Lo priorizado",
    columnas: COLUMNAS_DEL_BACKLOG,
    tip: "Todo lo pedido, priorizado: su valor, su esfuerzo y quién lo pidió.",
    agentHint: "Una fila por pedido o idea, de lo más valioso a lo menos.",
    brief: "EL BACKLOG PRIORIZADO: una fila por pedido o idea, de lo más valioso a lo menos. «Valor» y «Esfuerzo»: 'Alto', 'Medio' o 'Bajo'. «Quién lo pidió»: nombre o área que diga la fuente. «Estado»: 'Por hacer', 'En curso' o 'Hecho'.",
  }),
  seccionDeTabla({
    key: "diferido",
    label: "Lo que quedó para después",
    eyebrow: "Fuera por ahora",
    theme: "soft",
    columnas: COLUMNAS_DE_LO_DIFERIDO,
    tip: "Lo que se dejó afuera a propósito, para que no se pierda ni vuelva a discutirse sin motivo.",
    agentHint: "Una fila por lo que se dejó afuera, con su motivo.",
    brief: "LO DIFERIDO: lo que se habló y se dejó afuera a propósito, con su motivo y cuándo se retoma si la fuente lo dice.",
  }),
  seccionDeTabla({
    key: "decisiones",
    label: "Las decisiones",
    eyebrow: "Lo que se decidió",
    columnas: COLUMNAS_DE_LAS_DECISIONES,
    tip: "El registro de lo decidido: quién lo decidió, cuándo y qué cambia. Así no se vuelve a discutir.",
    agentHint: "Una fila por decisión tomada en una reunión o en un documento.",
    brief: "EL REGISTRO DE DECISIONES: solo lo que SE DECIDIÓ de verdad (no lo que se conversó). «Cuándo»: la fecha de la reunión si la fuente la da. «Qué cambia»: la consecuencia práctica en una línea.",
  }),
  seccionDeTabla({
    key: "horas",
    label: "Las horas",
    eyebrow: "Bolsa de horas",
    theme: "soft",
    columnas: COLUMNAS_DE_LAS_HORAS,
    tip: "Para un servicio con bolsa de horas: lo contratado, lo consumido y lo que queda.",
    agentHint: "Una fila por período, solo con números que la fuente diga.",
    brief: "LA BOLSA DE HORAS: solo si la fuente da los números. Sin números confirmados, deja `filas` vacío.",
  }),
  {
    ...ADOPCION_DEF_BY_KEY["cierre"],
    empty: HOJA_DE_RUTA_CIERRE_DEFAULT,
    brief: "Cierre curado por el equipo: titular + subtítulo + botón opcional (ej. agendar el seguimiento).",
  },
];

export const HOJA_DE_RUTA_TEMPLATE: BcTemplateDef = {
  id: "hoja_de_ruta_v1",
  caseLabel: "Hoja de ruta",
  maxTokens: 10000,
  brandVoice: false, // documento de TRABAJO: se discute con el cliente
  features: { useCaseChecklist: false },
  agentIntro:
    "Eres el consultor de Smarteam que escribe la HOJA DE RUTA de una cuenta: qué se va a hacer los próximos meses, en qué orden, qué quedó afuera y qué se decidió. Sale de lo que de verdad se conversó, no de lo que sería lindo hacer.\n\n" +
    "TU FUENTE: lo vendido (el handoff, solo lo apto para el cliente), las reuniones y notas de este documento, y los demás documentos del proyecto. Lo que dicen otros documentos pesa según su estado: lo «terminado» ya se acordó; lo «en construcción» todavía cambia.\n\n" +
    "DISCIPLINA: nunca inventes fechas, horas, personas ni prioridades. Lo que no esté confirmado se escribe igual con `⚠️ Por validar`. Si la fuente es delgada, la hoja sale más corta. Sin precios.\n\n" +
    "ESTE DOCUMENTO LO LEE EL CLIENTE: se le habla de tú, sin jerga interna.\n\n" +
    "FORMATO: cada sección tiene su propio shape. En las tablas, conserva las columnas que trae la sección, en su orden, y escribe solo las filas. Líneas cortas. Español, tuteo. Arrays vacíos donde no haya respaldo.",
  sections: HOJA_DE_RUTA_SECTION_DEFS,
};

/** Lookup key → def. */
export const HOJA_DE_RUTA_DEF_BY_KEY: Record<string, BCSectionDef> = Object.fromEntries(HOJA_DE_RUTA_SECTION_DEFS.map((d) => [d.key, d]));

/** El handoff que lee: el MISMO allowlist de la Planificación (documento que lee el cliente). */
export const HOJA_DE_RUTA_HANDOFF_KEYS = PLANIFICACION_HANDOFF_KEYS;
