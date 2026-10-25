/**
 * lib/analizador-venta/reglas.ts — QUÉ REUNIÓN ES DE VENTA, quién la vende, si se analiza y la bandera (S2 y S3,
 * 2026-10-25). PURO.
 *
 * Una reunión es de venta si su empresa dueña es:
 *   · un PROSPECTO, y no fue de puertas adentro;
 *   · un CLIENTE con una preventa de venta abierta (exploración sin proyecto), que no fue de puertas adentro y en la que
 *     estuvo alguien de Ventas.
 * Y la EXPANSIÓN de un cliente sin preventa (la «Fase 2: Marketing» de CEMACO vive como un negocio abierto de HubSpot, no
 * como preventa): con alguien de Ventas en la sala se puede analizar A MANO, y desde ese momento cuenta como de venta. No
 * entra sola porque ninguna señal la separa de la entrega (medido el 25 oct, en 90 días: «cliente con alguien de Ventas»
 * daba 436 reuniones de 51 clientes; con un negocio abierto, 346 de 29, renovaciones incluidas; con una exploración
 * abierta, 278, porque las de proyecto son el diagnóstico de Customer Success). Prospectos y preventas: 95 reuniones.
 * Las de entrega de Customer Success (un cliente sin Ventas en la sala), las de un aliado y las de
 * Smarteam no entran.
 * «Alguien de Ventas» es la misma regla de siempre (lib/handoff/sales-presence.ts), sobre la invitación del calendario:
 * nunca sobre la asistencia ni los minutos de la API de Meet (Google pide no usarlos para medir desempeño).
 *
 * Solo se analiza una reunión con TRANSCRIPCIÓN: las notas de Gemini no dicen quién dijo qué. El análisis automático va
 * detrás de `ANALIZADOR_VENTA=1` (apagado: primero lo prueban los super admin con Andrés, S6); a mano, el botón siempre.
 */

export type Entorno = Readonly<Record<string, string | undefined>>;

/** ¿Analiza solo cada reunión de venta que llega con transcripción? Apagado por defecto. */
export function analizadorAutomaticoPrendido(env: Entorno): boolean {
  return env.ANALIZADOR_VENTA === "1";
}

/** ¿Se puede analizar a mano aunque no sea de venta sola? La expansión de un cliente con Ventas en la sala. */
export function seAnalizaAMano(porQueNo: PorQueNoEsDeVenta | null): boolean {
  return porQueNo === null || porQueNo === "cliente_sin_preventa";
}

/** Por qué el job `analizador-venta` no corre en este servidor, o null. */
export function motivoAnalizadorApagado(env: Entorno): string | null {
  return analizadorAutomaticoPrendido(env) ? null : "Apagado: falta ANALIZADOR_VENTA=1 en el .env del servidor. Se puede analizar a mano desde cada reunión.";
}

/** Cuántos días después de la reunión la analiza el job solo (como la lectura de cada reunión). */
export const DIAS_PARA_ANALIZAR_SOLA = 14;

export type PorQueNoEsDeVenta = "sin_empresa" | "puertas_adentro" | "aliado_o_smarteam" | "cliente_sin_ventas" | "cliente_sin_preventa";

export const TEXTO_DE_POR_QUE_NO: Record<PorQueNoEsDeVenta, string> = {
  sin_empresa: "No tiene empresa: primero hay que decidir de quién es.",
  puertas_adentro: "Fue solo con gente de Smarteam.",
  aliado_o_smarteam: "Es de un aliado o de Smarteam.",
  cliente_sin_ventas: "Es con un cliente y no estuvo nadie de Ventas: es de entrega, no de venta.",
  cliente_sin_preventa: "Es con un cliente sin preventa abierta. Si fue una conversación de venta (una expansión), analízala a mano.",
};

/** null = es de venta; si no, por qué no. */
export function porQueNoEsDeVenta(r: { kind: string | null; puertasAdentro: boolean; conVentas: boolean; conPreventa: boolean }): PorQueNoEsDeVenta | null {
  if (!r.kind) return "sin_empresa";
  if (r.puertasAdentro) return "puertas_adentro";
  if (r.kind === "PROSPECTO") return null;
  if (r.kind === "CLIENTE") return !r.conVentas ? "cliente_sin_ventas" : r.conPreventa ? null : "cliente_sin_preventa";
  return "aliado_o_smarteam";
}

/** Los de Smarteam que estuvieron, por la invitación (organizó o fue invitado), sin repetir: a quienes se atribuye. */
export function delEquipoEnLaReunion(r: { organizador: string | null; participantes: readonly string[] }, propios: ReadonlySet<string>): string[] {
  return [...new Set([r.organizador ?? "", ...r.participantes].map((e) => e.trim().toLowerCase()))].filter((e) => e.includes("@") && propios.has(e.split("@")[1] ?? ""));
}

/** Quién vende: los de Ventas que estuvieron; si no hubo (un prospecto con solo Customer Success), todos los del equipo. */
export function vendedoresDeLaReunion(delEquipo: readonly string[], ventas: ReadonlySet<string>): string[] {
  const deVentas = delEquipo.filter((e) => ventas.has(e));
  return deVentas.length ? deVentas : [...delEquipo];
}

/**
 * ¿Ve el analizador? Primero solo los super admin, para probarlo (Elías, 24 oct); después todo Ventas, cada uno con sus
 * análisis (S5). Es por rol y fuera de la matriz de permisos a propósito mientras se prueba: abrirlo es cambiar esta línea.
 */
export function veElAnalizador(rol: string | null | undefined): boolean {
  return rol === "SUPER_ADMIN";
}
