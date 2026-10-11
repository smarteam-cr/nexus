/**
 * lib/seguimiento/hechos/tipos.ts — QUÉ ES UN HECHO de una reunión (memoria de la cuenta, etapas 5 y 6). PURO y
 * client-safe: lo comparten el sondeo (scripts/sondeo-de-hechos.ts), el enrutador, el registro de destinos y la pantalla.
 * Una sola definición: lo que mide el sondeo es lo que se despliega. Ver docs/DECISIONS.md «Hechos, enrutador y novedades».
 *
 * Un hecho es una frase con su cita literal verificada, de quién es (la cuenta o un proyecto vinculado) y su tipo. El
 * modelo clasifica; el código verifica la cita (salida.ts) y decide a dónde va (el enrutador de la etapa 6).
 *
 * Lo que NO es un hecho: un compromiso (va a Tareas por la salida estándar de la lectura) y un pedido nuevo (va a
 * `PedidoFueraDeAlcance`).
 */

/** Los tipos que el modelo escribe en la lista `hechos`. */
export const TIPOS_DE_HECHO_DE_LA_LISTA = ["cuenta", "persona", "acuerdo", "resultado", "proceso_hoy", "queja", "riesgo"] as const;

/** Las señales van en sus propias listas (`senal_cronograma` y `senal_etapa`): cada una con su cita y el proyecto. */
export const TIPOS_DE_SENAL = ["senal_cronograma", "senal_etapa"] as const;

/** Todos los tipos de hecho, con la prueba de admisión escrita en DECISIONS. */
export const TIPOS_DE_HECHO = [...TIPOS_DE_HECHO_DE_LA_LISTA, ...TIPOS_DE_SENAL] as const;

export type TipoDeHechoDeLaLista = (typeof TIPOS_DE_HECHO_DE_LA_LISTA)[number];
export type TipoDeSenal = (typeof TIPOS_DE_SENAL)[number];
export type TipoDeHecho = (typeof TIPOS_DE_HECHO)[number];

/** El tema de un acuerdo: decide la sección de Planificación, Integraciones, Kickoff o Diagnóstico a la que va. */
export const TEMAS_DE_ACUERDO = ["pipeline", "propiedades", "integracion", "automatizacion", "conversaciones", "proceso_despues", "alcance"] as const;
export type TemaDeAcuerdo = (typeof TEMAS_DE_ACUERDO)[number];

/** Quién dijo la cita. `null` = no se sabe (por ejemplo, una cita de las notas de Gemini). */
export type QuienDijo = "cliente" | "smarteam" | null;

/** Para una queja y un riesgo. */
export const GRAVEDADES = ["baja", "media", "alta"] as const;
export type Gravedad = (typeof GRAVEDADES)[number];

/** De dónde sale el texto que se leyó: la transcripción, las notas de Gemini o un texto sumado a mano. */
export const FUENTES_DEL_TEXTO = ["transcripcion", "notas", "texto"] as const;
export type FuenteDelTexto = (typeof FUENTES_DEL_TEXTO)[number];

/** El ámbito: la cuenta, o un proyecto vinculado de la lista del pedido (P1, P2…). */
export type AmbitoDeHecho = "cuenta" | `P${number}`;

/** Lo que devuelve el modelo, ya leído (sin verificar). */
export interface HechoLeido {
  tipo: TipoDeHecho;
  /** Solo en un acuerdo. */
  tema?: TemaDeAcuerdo;
  /** El hecho en una frase, en tercera persona y sin montos. */
  frase: string;
  /** La frase de la reunión que lo respalda, copiada tal cual. */
  cita: string;
  ambito: AmbitoDeHecho;
  quien: QuienDijo;
  /** Solo en una queja y en un riesgo. */
  gravedad?: Gravedad;
}

/** Un hecho cuya cita se encontró tal cual en lo que se le mandó al modelo. */
export interface HechoVerificado extends HechoLeido {
  /** El proyecto del ámbito; null si es de la cuenta (o si el P# no estaba en la lista). */
  projectId: string | null;
  /** Para juntar el mismo hecho dicho en dos reuniones sin volver a mandarlo a ningún lado (`huellaDeHecho`). */
  huella: string;
  /** En qué parte del texto apareció la cita. */
  fuenteDeLaCita: FuenteDelTexto;
  /** Quién la dijo, según la transcripción (el nombre del turno). null si salió de las notas. */
  hablante: string | null;
  /**
   * `quien` lo comprobó el turno de la transcripción (el nombre y el apellido de alguien del equipo, o un nombre que no es
   * de nadie del equipo). false (o ausente) = lo dijo el modelo: una cita de las notas, o un solo nombre que coincide con
   * alguien del equipo. Solo con `quien` comprobado una queja levanta una alerta (`loDijoElCliente`).
   */
  quienComprobado?: boolean;
}

/**
 * ¿La cita la dijo alguien del CLIENTE, comprobado? Una cita de la transcripción, en el turno de alguien que no es del
 * equipo. Una cita de las notas de Gemini (un resumen, no palabras del cliente), de un texto sumado a mano o con un
 * hablante dudoso NO cuenta: ahí `quien` lo dijo el modelo.
 */
export function loDijoElCliente(h: Pick<HechoVerificado, "quien" | "fuenteDeLaCita"> & { quienComprobado?: boolean }): boolean {
  return h.quien === "cliente" && h.quienComprobado === true && h.fuenteDeLaCita === "transcripcion";
}

/** Cuántos hechos se aceptan por reunión (y cuántas señales de cada clase). Lo que sobra se descarta con su motivo. */
export const MAX_HECHOS_POR_REUNION = 12;

/** El largo útil de una cita, en caracteres normalizados: menos no prueba nada; más no es una frase. */
export const LARGO_CITA = [12, 400] as const;

/** Un hecho sin usar se da por vencido a los 30 días. Se calcula al leer: no hace falta un job. */
export const DIAS_PARA_VENCER = 30;

/** Por qué se descartó un hecho que devolvió el modelo. */
export const MOTIVOS_DE_DESCARTE = [
  "incompleto",
  "cita_corta",
  "cita_larga",
  "cita_no_aparece",
  "cita_de_varios_hablantes",
  "persona_de_smarteam",
  "voseo",
  "repetido",
  "sobra",
  "cortado",
] as const;
export type MotivoDeDescarte = (typeof MOTIVOS_DE_DESCARTE)[number];

/** Cómo se lee cada motivo en el reporte del sondeo y en la pantalla. */
export const ROTULO_DEL_MOTIVO: Record<MotivoDeDescarte, string> = {
  incompleto: "le falta un dato (tipo, frase o cita)",
  cita_corta: "la cita es demasiado corta para probar algo",
  cita_larga: "la cita es más larga que una frase",
  cita_no_aparece: "la cita no aparece tal cual en la reunión",
  cita_de_varios_hablantes: "la cita junta lo que dijeron dos personas",
  persona_de_smarteam: "la persona es del equipo de Smarteam",
  voseo: "la frase tiene voseo",
  repetido: "ya estaba en la misma reunión",
  sobra: `pasa el tope de ${MAX_HECHOS_POR_REUNION} por reunión`,
  cortado: "la respuesta se cortó en este hecho",
};

export const esTipoDeHecho = (v: unknown): v is TipoDeHecho => typeof v === "string" && (TIPOS_DE_HECHO as readonly string[]).includes(v);
export const esTipoDeLaLista = (v: unknown): v is TipoDeHechoDeLaLista => typeof v === "string" && (TIPOS_DE_HECHO_DE_LA_LISTA as readonly string[]).includes(v);
export const esTemaDeAcuerdo = (v: unknown): v is TemaDeAcuerdo => typeof v === "string" && (TEMAS_DE_ACUERDO as readonly string[]).includes(v);
export const esGravedad = (v: unknown): v is Gravedad => typeof v === "string" && (GRAVEDADES as readonly string[]).includes(v);
export const esSenal = (t: TipoDeHecho): t is TipoDeSenal => (TIPOS_DE_SENAL as readonly string[]).includes(t);

/** «cuenta», «P1», «P12»… Cualquier otra cosa no es un ámbito. */
export function esAmbito(v: unknown): v is AmbitoDeHecho {
  return typeof v === "string" && (v === "cuenta" || /^P[1-9]\d*$/.test(v));
}

/** Cómo se lee un tipo en el reporte del sondeo y en la pantalla. */
export const ROTULO_DEL_TIPO: Record<TipoDeHecho, string> = {
  cuenta: "De la cuenta",
  persona: "Persona",
  acuerdo: "Acuerdo",
  resultado: "Resultado",
  proceso_hoy: "Proceso de hoy",
  queja: "Queja",
  riesgo: "Riesgo",
  senal_cronograma: "Señal de cronograma",
  senal_etapa: "Señal de etapa",
};

export const ROTULO_DEL_TEMA: Record<TemaDeAcuerdo, string> = {
  pipeline: "Pipeline",
  propiedades: "Propiedades",
  integracion: "Integración",
  automatizacion: "Automatización",
  conversaciones: "Conversaciones",
  proceso_despues: "Proceso después",
  alcance: "Alcance",
};
