/**
 * lib/sessions/compromisos-y-alcance.ts — los COMPROMISOS CON FECHA y los PEDIDOS FUERA DE ALCANCE que
 * salen en una reunión (2026-10-02). PURO: el pedido al modelo y la lectura de su respuesta.
 *
 * ── LA VALIDACIÓN QUE LO MOTIVÓ ──────────────────────────────────────────────────────────────
 * Sobre 14 sesiones reales de 5 proyectos se extrajeron 41 hechos a mano. El agente de avance (el que
 * crea las particularidades) capturó 4. Sus 21 compromisos de insumo o acción («Rodrigo entrega la
 * base el miércoles», «la orden de compra el viernes 10») y sus 13 pedidos fuera de alcance («ese
 * módulo no estaba incluido», DocuSign, Encuentra 24) se perdían: el prompt los prohibía, no los
 * pedía, o nunca le llegaban (veía el 4 % de cada reunión).
 *
 * ── DÓNDE SE DETECTAN AHORA ──────────────────────────────────────────────────────────────────
 * En el análisis post-sesión (lib/sessions/post-process.ts): lee el transcript completo y corre para
 * TODA reunión, tenga o no cronograma el proyecto. Una sola pasada (doctrina: un clasificador sobre
 * una pasada que ya existe, nunca un agente por destino). Esta adenda se suma a su prompt.
 *  · compromisos → ActionItem con quién se comprometió (cliente o Smarteam), la fecha y la cita.
 *  · fueraDeAlcance → PedidoFueraDeAlcance: lo decide el CSE y Ventas lo ve como oportunidad.
 * El agente de avance queda para lo suyo: los atrasos y las fechas del plan que se mueven.
 */
import { fingerprintFromTitle } from "@/lib/timeline/particularidad-identity";

export const ADENDA_COMPROMISOS_Y_ALCANCE = `

ADEMÁS DE LO ANTERIOR, agrega a tu JSON dos listas (vacías si no hay nada):

"compromisos": cada COMPROMISO CON FECHA que se tomó en la reunión, de cualquiera de los dos lados. Ejemplos: «el cliente envía la base de datos el miércoles», «Smarteam entrega el tablero el viernes», «la orden de compra sale el 10 de octubre», «la próxima sesión es el martes y se revisa X».
  { "quien": "CLIENTE" | "SMARTEAM", "responsable": "<nombre de la persona, si se dijo>", "que": "<qué se comprometió, en una frase>", "fecha": "<AAAA-MM-DD calculada desde la fecha de la reunión; null si no se puede saber>", "tipo": "PLAN" | "INSUMO" | "ACCION", "cita": "<fragmento corto que lo respalda>" }
  - tipo PLAN = mueve o fija una fecha del proyecto; INSUMO = algo que el cliente tiene que entregar; ACCION = una tarea de cualquiera de los dos.
  - Un compromiso con fecha va SOLO acá: NO lo repitas en "actionItems" (ahí quedan las acciones sin fecha).
  - Calcula la fecha con el calendario: si la reunión fue el jueves 1 de octubre y dicen «el miércoles», es el miércoles 7 de octubre.

"fueraDeAlcance": cada PEDIDO del cliente que NO está en lo que se vendió (tienes el alcance contratado más abajo, si existe). Señales: «eso no estaba incluido», una cotización, una propuesta aparte, la bolsa de horas, un monto nuevo, una integración o un módulo que no figura en lo vendido.
  { "huella": "<identificador estable del pedido, en-minusculas-con-guiones>", "pedido": "<qué pidió, en una frase>", "quienLoPidio": "<nombre y rol, si se dijo>", "estado": "PEDIDO" | "COTIZADO" | "APROBADO" | "DESCARTADO", "monto": "<monto u horas si se dijo, o null>", "cita": "<fragmento corto que lo respalda>" }
  - Una decisión de no hacerlo (por costo, por tiempo) es estado DESCARTADO: nunca es un atraso.
  - Si el mismo pedido ya se habló antes, usa la MISMA huella.
  - No inventes: solo lo que la reunión respalde.`;

export interface CompromisoDetectado {
  quien: "CLIENTE" | "SMARTEAM";
  responsable: string;
  que: string;
  /** AAAA-MM-DD, o null. */
  fecha: string | null;
  tipo: "PLAN" | "INSUMO" | "ACCION";
  cita: string;
}

export type EstadoDePedido = "PEDIDO" | "COTIZADO" | "APROBADO" | "DESCARTADO" | "INCLUIDO";
export const ESTADOS_DE_PEDIDO: readonly EstadoDePedido[] = ["PEDIDO", "COTIZADO", "APROBADO", "DESCARTADO", "INCLUIDO"];

export interface PedidoDetectado {
  huella: string;
  pedido: string;
  quienLoPidio: string;
  estado: EstadoDePedido;
  monto: string | null;
  cita: string;
}

const texto = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function leerCompromisos(raw: unknown): CompromisoDetectado[] {
  if (!Array.isArray(raw)) return [];
  const out: CompromisoDetectado[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const c = x as Record<string, unknown>;
    const que = texto(c.que, 500);
    if (!que) continue;
    const fecha = texto(c.fecha, 10);
    out.push({
      quien: c.quien === "SMARTEAM" ? "SMARTEAM" : "CLIENTE",
      responsable: texto(c.responsable, 120),
      que,
      fecha: FECHA.test(fecha) ? fecha : null,
      tipo: c.tipo === "PLAN" || c.tipo === "INSUMO" ? c.tipo : "ACCION",
      cita: texto(c.cita, 400),
    });
  }
  return out.slice(0, 20);
}

export function leerPedidosFueraDeAlcance(raw: unknown): PedidoDetectado[] {
  if (!Array.isArray(raw)) return [];
  const out: PedidoDetectado[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const p = x as Record<string, unknown>;
    const pedido = texto(p.pedido, 500);
    if (!pedido) continue;
    const huella = fingerprintFromTitle(texto(p.huella, 80) || pedido);
    if (!huella) continue;
    const estado = (ESTADOS_DE_PEDIDO as readonly string[]).includes(String(p.estado)) ? (p.estado as EstadoDePedido) : "PEDIDO";
    out.push({
      huella,
      pedido,
      quienLoPidio: texto(p.quienLoPidio, 160),
      estado,
      monto: texto(p.monto, 120) || null,
      cita: texto(p.cita, 400),
    });
  }
  return out.slice(0, 10);
}

/**
 * La fecha de una reunión en Costa Rica (AAAA-MM-DD). Antes se mandaba en UTC: una reunión de las
 * 18:00 de Costa Rica aparecía con la fecha del día siguiente, y todo «el miércoles» calculado desde
 * ahí caía un día corrido.
 */
export function fechaLocalDeLaReunion(fecha: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica", year: "numeric", month: "2-digit", day: "2-digit" }).format(fecha);
}

/** AAAA-MM-DD → Date al mediodía UTC: así ninguna zona horaria la corre de día al mostrarla. */
export function fechaComprometida(ymd: string | null): Date | null {
  if (!ymd || !FECHA.test(ymd)) return null;
  const d = new Date(`${ymd}T12:00:00.000Z`);
  return isNaN(d.getTime()) ? null : d;
}
