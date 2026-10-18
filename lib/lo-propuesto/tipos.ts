/**
 * lib/lo-propuesto/tipos.ts — el CICLO DE VIDA de todo lo que Nexus propone. CLIENT-SAFE y puro.
 *
 * Pieza 5 del circuito de la memoria de la cuenta (docs/DECISIONS.md, «Una sola revisión por reunión», 2026-10-09):
 * todo lo que Nexus deja para que una persona lo use o lo descarte tiene UNA de cuatro formas de estar:
 *
 *   pendiente    — nadie lo decidió y todavía está en su plazo
 *   usado        — una persona lo tomó (tal cual o cambiado)
 *   desestimado  — una persona dijo que no
 *   vencido      — nadie lo decidió en su plazo, o lo cerró el sistema. Se CALCULA al leer (salvo en Tareas, que lo
 *                  guarda a los 14 días): no borra nada y no impide decidir después.
 *
 * «Sin firma» marca lo que pasó a usado o desestimado sin una persona detrás (lo escribió el modelo, una regla vieja).
 *
 * Lo leen la tarjeta «Lo que dejó esta reunión» (lib/seguimiento), «Para ti» y los datos de «Uso de Nexus»
 * (lib/lo-propuesto/uso-server.ts). Un tipo nuevo de propuesta se suma acá con su lector en
 * lib/lo-propuesto/registro-server.ts: no se construye un `lib/conclusiones` aparte.
 */

export type EstadoDeLoPropuesto = "pendiente" | "usado" | "desestimado" | "vencido";

export const ESTADOS_DE_LO_PROPUESTO: readonly EstadoDeLoPropuesto[] = ["pendiente", "usado", "desestimado", "vencido"];

/** Dónde se usa lo propuesto. Después se suman el cronograma, la preventa y los procesos. */
export type ModuloDeLoPropuesto = "reuniones" | "clientes" | "exito" | "tareas";

export const NOMBRE_DEL_MODULO: Record<ModuloDeLoPropuesto, string> = {
  reuniones: "Reuniones",
  clientes: "Clientes",
  exito: "Éxito del cliente",
  tareas: "Tareas",
};

export type ClaveDeTipo =
  | "minuta"
  | "pedido-fuera-de-alcance"
  | "campo-de-ficha"
  | "etapa-sugerida"
  | "fecha-del-diagnostico"
  | "tarea-propuesta"
  | "alerta-del-vigia"
  | "alerta-de-regla"
  | "compromiso-legacy"
  | "novedad"
  | "hecho"
  | "sugerencia-del-handoff"
  | "nota-para-hubspot"
  | "recomendacion-de-recurrencia";

export const TIPOS_DE_LO_PROPUESTO: readonly ClaveDeTipo[] = [
  "minuta",
  "pedido-fuera-de-alcance",
  "campo-de-ficha",
  "etapa-sugerida",
  "fecha-del-diagnostico",
  "tarea-propuesta",
  "alerta-del-vigia",
  "alerta-de-regla",
  "compromiso-legacy",
  "novedad",
  "hecho",
  "sugerencia-del-handoff",
  "nota-para-hubspot",
  "recomendacion-de-recurrencia",
];

export const NOMBRE_DEL_TIPO: Record<ClaveDeTipo, string> = {
  minuta: "Minuta de la reunión",
  "pedido-fuera-de-alcance": "Pedido fuera de alcance",
  "campo-de-ficha": "Campo de la información del cliente",
  "etapa-sugerida": "Etapa sugerida",
  "fecha-del-diagnostico": "Fecha de presentación del diagnóstico",
  "tarea-propuesta": "Tarea propuesta",
  "alerta-del-vigia": "Alerta del vigía",
  "alerta-de-regla": "Alerta de una regla",
  "compromiso-legacy": "Compromiso (antes de Tareas)",
  novedad: "Novedad para un documento",
  hecho: "Hecho de una reunión para Procesos",
  "sugerencia-del-handoff": "Sugerencia sobre el handoff congelado",
  "nota-para-hubspot": "Nota para HubSpot después de una reunión",
  "recomendacion-de-recurrencia": "Pasar el servicio a SmartLoop",
};

export const MODULO_DEL_TIPO: Record<ClaveDeTipo, ModuloDeLoPropuesto> = {
  minuta: "reuniones",
  "pedido-fuera-de-alcance": "reuniones",
  "campo-de-ficha": "clientes",
  "etapa-sugerida": "clientes",
  "fecha-del-diagnostico": "clientes",
  "tarea-propuesta": "tareas",
  "alerta-del-vigia": "exito",
  "alerta-de-regla": "exito",
  "compromiso-legacy": "reuniones",
  novedad: "clientes",
  hecho: "clientes",
  "sugerencia-del-handoff": "clientes",
  "nota-para-hubspot": "reuniones",
  "recomendacion-de-recurrencia": "clientes",
};

/**
 * Qué guarda cada tipo de lo que se decidió. `quien`: guarda quién lo decidió. `descarte`: un «no» queda registrado
 * (se puede contar). La minuta no se desestima (decisión de Elías: es memoria y se corrige). La etapa no guarda nada:
 * responder la encuesta borra la sugerencia, así que de ella solo se sabe lo que sigue pendiente o venció. Los
 * compromisos viejos (`ActionItem`) no guardan quién: se retiran en la etapa 2.
 *
 * Los de la etapa 6 y la 3b: una NOVEDAD guarda quién la usó («Listo», el acuerdo del chat) o la desestimó («No aplica»)
 * en su destino. Un HECHO para Procesos guarda quién volvió a mapear, pero no tiene un «no» (no hay botón: solo vence o
 * lo cierra el sistema). Una SUGERENCIA del handoff es un bloque en borrador: el bloque no guarda quién la usó, y
 * descartarla lo borra, así que no se distingue de una que reemplazó otra búsqueda o «Rehacer desde cero».
 */
export const GUARDA: Record<ClaveDeTipo, { quien: boolean; descarte: boolean }> = {
  minuta: { quien: true, descarte: false },
  "pedido-fuera-de-alcance": { quien: true, descarte: true },
  "campo-de-ficha": { quien: true, descarte: true },
  "etapa-sugerida": { quien: false, descarte: false },
  "fecha-del-diagnostico": { quien: true, descarte: true },
  "tarea-propuesta": { quien: true, descarte: true },
  "alerta-del-vigia": { quien: true, descarte: true },
  "alerta-de-regla": { quien: true, descarte: true },
  "compromiso-legacy": { quien: false, descarte: false },
  novedad: { quien: true, descarte: true },
  hecho: { quien: true, descarte: false },
  "sugerencia-del-handoff": { quien: false, descarte: false },
  "nota-para-hubspot": { quien: true, descarte: true },
  "recomendacion-de-recurrencia": { quien: true, descarte: true },
};

/** Cuántos días pide revisión lo propuesto (y la tarjeta de una reunión, desde la fecha de la reunión). */
export const PLAZO_PARA_REVISAR_DIAS = 30;

/** Cómo está una propuesta, según la regla de su tipo (lib/lo-propuesto/ciclo.ts). */
export interface EstadoCalculado {
  estado: EstadoDeLoPropuesto;
  /** Pasó a usado o desestimado sin una persona. Nunca en pendiente ni en vencido. */
  sinFirma: boolean;
  decididoPor: string | null;
  /** ISO. */
  decididoEn: string | null;
}

export interface ItemPropuesto extends EstadoCalculado {
  tipo: ClaveDeTipo;
  id: string;
  texto: string;
  cita?: string | null;
  /** ISO: cuándo nació la propuesta (la mejor fecha que guarda su tipo). */
  nacioEn: string;
  /** La propuso un modelo o una regla en código. */
  origen: "ia" | "regla";
}
