/**
 * lib/lo-propuesto/ciclo.ts — la regla de cada tipo: cómo está una propuesta HOY. PURO.
 *
 * Cada número de la tarjeta de una reunión, de «Para ti» y de «Uso de Nexus» sale de acá. Las fechas se cuentan por
 * DÍA de Costa Rica, a mano: nunca `new Date("AAAA-MM-DD")`, que en UTC-6 se lee como el día anterior.
 *
 * El plazo es del TIPO: lo propuesto pide revisión 30 días desde que nació, y la tarjeta de una reunión 30 días desde
 * la fecha de la reunión. Las tareas propuestas no usan este plazo: vencen solas a los 14 días y lo dejan GUARDADO
 * (regla de Tareas), así que acá se respeta lo guardado. Una alerta no vence por fecha. Decidir después del plazo
 * vale y reemplaza al «vencido».
 */
import { crDateParts } from "@/lib/jobs/time";
import { estaVencido } from "@/lib/seguimiento/hechos/estado";
import { estadoDeSolicitud } from "@/lib/sessions/solicitudes-fuera-de-alcance";
import { PLAZO_PARA_REVISAR_DIAS, type EstadoCalculado, type EstadoDeLoPropuesto } from "./tipos";

/** Quien firma lo que hizo una regla o un job, sin persona detrás (Tareas y las alertas usan el mismo texto). */
export const FIRMA_DEL_SISTEMA = "sistema";

const AAAA_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

/** El día de Costa Rica (AAAA-MM-DD) de un instante. Un AAAA-MM-DD se devuelve tal cual. */
export function diaCR(f: Date | string): string {
  if (typeof f === "string" && AAAA_MM_DD.test(f)) return f;
  return crDateParts(typeof f === "string" ? new Date(f) : f).dateKey;
}

function aUTC(iso: string): number {
  const [a, m, d] = iso.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
}

/** AAAA-MM-DD + n días, con aritmética de calendario (sin zonas). */
export function sumarDias(iso: string, n: number): string {
  return new Date(aUTC(iso) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Días de `desde` a `hasta` (los dos AAAA-MM-DD). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aUTC(hasta) - aUTC(desde)) / 86_400_000);
}

/** El primer día en que ya venció (AAAA-MM-DD): nació + plazo. Una reunión del 9 oct pide hasta el 7 nov y vence el 8. */
export function venceEl(nacio: Date | string, plazoDias = PLAZO_PARA_REVISAR_DIAS): string {
  return sumarDias(diaCR(nacio), plazoDias);
}

/** El último día en que todavía pide revisión. */
export function pideHasta(nacio: Date | string, plazoDias = PLAZO_PARA_REVISAR_DIAS): string {
  return sumarDias(diaCR(nacio), plazoDias - 1);
}

/** ¿Pasó su plazo sin que nadie lo decidiera? */
export function vencioSinRevisar(nacio: Date | string, hoyISO: string, plazoDias = PLAZO_PARA_REVISAR_DIAS): boolean {
  return diaCR(hoyISO) >= venceEl(nacio, plazoDias);
}

const iso = (v: Date | string | null | undefined): string | null =>
  v == null ? null : typeof v === "string" ? v : v.toISOString();

const deUnaPersona = (por: string | null | undefined): por is string => !!por && por.toLowerCase() !== FIRMA_DEL_SISTEMA;

/** Lo decidió alguien (o quedó decidido sin firma). */
function decidido(estado: Extract<EstadoDeLoPropuesto, "usado" | "desestimado">, por: string | null | undefined, en: Date | string | null | undefined): EstadoCalculado {
  const persona = deUnaPersona(por);
  return { estado, sinFirma: !persona, decididoPor: persona ? por.toLowerCase() : null, decididoEn: iso(en) };
}

/** Nadie lo decidió: pendiente mientras está en su plazo, vencido después. */
function sinDecidir(nacio: Date | string, hoyISO: string, plazoDias = PLAZO_PARA_REVISAR_DIAS): EstadoCalculado {
  return { estado: vencioSinRevisar(nacio, hoyISO, plazoDias) ? "vencido" : "pendiente", sinFirma: false, decididoPor: null, decididoEn: null };
}

const vencidoPorElSistema = (en: Date | string | null | undefined): EstadoCalculado => ({
  estado: "vencido",
  sinFirma: false,
  decididoPor: null,
  decididoEn: iso(en),
});

// ── Minuta ──────────────────────────────────────────────────────────────────────────

/** REVIEWED o EDITED = usada; DRAFT = pendiente o vencida. La minuta no se desestima: se corrige. */
export function estadoDeMinuta(
  m: { status: string; reviewedByEmail: string | null; reviewedAt: Date | string | null; createdAt: Date | string },
  hoyISO: string,
): EstadoCalculado {
  if (m.status === "REVIEWED" || m.status === "EDITED") return decidido("usado", m.reviewedByEmail, m.reviewedAt);
  return sinDecidir(m.createdAt, hoyISO);
}

// ── Pedido fuera de alcance ────────────────────────────────────────────────────────

/**
 * PEDIDO = pendiente o vencido; CONFIRMADO, COTIZADO, APROBADO, RECHAZADO e INCLUIDO = usado (alguien lo revisó y
 * decidió qué es); DESCARTADO = desestimado. Un pedido que sumó una persona (`creadoPor`) no es una propuesta: null.
 */
export function estadoDePedido(
  p: { estado: string; decididoPor: string | null; decididoAt: Date | string | null; creadoPor: string | null; createdAt: Date | string },
  hoyISO: string,
): EstadoCalculado | null {
  if (p.creadoPor) return null;
  const e = estadoDeSolicitud(p.estado);
  if (e === "PEDIDO") return sinDecidir(p.createdAt, hoyISO);
  return decidido(e === "DESCARTADO" ? "desestimado" : "usado", p.decididoPor, p.decididoAt);
}

// ── Tarea propuesta ────────────────────────────────────────────────────────────────

const DECISION_USADA = new Set(["tal_cual", "con_cambios", "mas_adelante"]);
const DECISION_DESESTIMADA = new Set(["rechazada", "misma", "retirada"]);

/**
 * Respeta lo que guardó Tareas: una propuesta vence sola a los 14 días con `decision: "vencida"`, y mientras está en
 * `propuesta` es pendiente (el plazo de 30 días no se le aplica). null = no nació como propuesta.
 */
export function estadoDeTarea(t: {
  estado: string;
  decision: string | null;
  decididaPorEmail: string | null;
  decididaAt: Date | string | null;
}): EstadoCalculado | null {
  if (t.decision === "vencida" || (!t.decision && t.estado === "vencida")) return vencidoPorElSistema(t.decididaAt);
  if (t.decision && DECISION_USADA.has(t.decision)) return decidido("usado", t.decididaPorEmail, t.decididaAt);
  if (t.decision && DECISION_DESESTIMADA.has(t.decision)) return decidido("desestimado", t.decididaPorEmail, t.decididaAt);
  if (t.estado === "propuesta") return { estado: "pendiente", sinFirma: false, decididoPor: null, decididoEn: null };
  return null;
}

// ── Alerta ─────────────────────────────────────────────────────────────────────────

/**
 * Abierta o vista = pendiente (una alerta no vence por fecha). Resuelta = usada, descartada = desestimada, por una
 * persona. Cerrada por el sistema (`resolvedByEmail: "sistema"`) = vencida: nunca cuenta como usada.
 */
export function estadoDeAlerta(a: { status: string; resolvedByEmail: string | null; resolvedAt: Date | string | null }): EstadoCalculado {
  if (a.status === "RESOLVED" || a.status === "DISMISSED") {
    if ((a.resolvedByEmail ?? "").toLowerCase() === FIRMA_DEL_SISTEMA) return vencidoPorElSistema(a.resolvedAt);
    return decidido(a.status === "RESOLVED" ? "usado" : "desestimado", a.resolvedByEmail, a.resolvedAt);
  }
  return { estado: "pendiente", sinFirma: false, decididoPor: null, decididoEn: null };
}

// ── Campo de la ficha ──────────────────────────────────────────────────────────────

/** Un campo que sigue en la propuesta de la ficha, desde que se propuso. */
export function estadoDeCampoPendiente(propuestoEn: Date | string, hoyISO: string): EstadoCalculado {
  return sinDecidir(propuestoEn, hoyISO);
}

/** Un campo ya decidido, desde el registro `FichaGuardada.decisiones`. */
export function estadoDeDecisionDeCampo(d: { estado: string; por: string; en: string }): EstadoCalculado {
  return decidido(d.estado === "desestimado" ? "desestimado" : "usado", d.por, d.en);
}

// ── Etapa sugerida ─────────────────────────────────────────────────────────────────

/**
 * Solo para una sugerencia que sigue en pie (`sugerenciaVigente`): pendiente o vencida a los 30 días. Lo que ya se
 * respondió no se puede saber: responder la encuesta borra la sugerencia.
 */
export function estadoDeEtapa(at: Date | string, hoyISO: string): EstadoCalculado {
  return sinDecidir(at, hoyISO);
}

// ── Fecha de presentación del diagnóstico ──────────────────────────────────────────

/** La fecha que leyó Nexus y espera: pendiente o vencida a los 30 días. */
export function estadoDePropuestaDeFecha(en: Date | string, hoyISO: string): EstadoCalculado {
  return sinDecidir(en, hoyISO);
}

/** La fecha propuesta que alguien usó o descartó: una fila de `PresentacionDeDocumento` con quién y cuándo (lib/presentaciones). */
export function estadoDeFechaDecidida(d: { usada: boolean; por: string; en: string }): EstadoCalculado {
  return decidido(d.usada ? "usado" : "desestimado", d.por, d.en);
}

// ── Destino de un hecho (etapa 6): una novedad o el aviso de Procesos ───────────────

/**
 * Un destino de un hecho que espera a una persona: una NOVEDAD (la usan «Listo» o el acuerdo del chat que la llevaba;
 * «No aplica» la desestima) o el aviso de PROCESOS (volver a mapear lo usa). Pendiente con la misma regla que la franja
 * del documento (`estaVencido`: 30 días desde que la lectura propuso el hecho). Lo que cerró el sistema (la reunión
 * cambió de dueño) cuenta como vencido, como una alerta cerrada por el sistema. Un destino DELEGADO no se cuenta acá
 * (null): su ciclo vive en su módulo, que ya lo cuenta (la ficha, la alerta, la etapa).
 */
export function estadoDeDestinoDeHecho(
  d: { estado: string; decididoPorEmail?: string | null; decididoAt?: string | null },
  nacio: Date | string,
  ahora: Date,
): EstadoCalculado | null {
  if (d.estado === "pendiente") {
    const vencido = estaVencido({ estado: "pendiente", createdAt: nacio }, ahora);
    return { estado: vencido ? "vencido" : "pendiente", sinFirma: false, decididoPor: null, decididoEn: null };
  }
  if (d.estado === "usado" || d.estado === "desestimado") {
    if ((d.decididoPorEmail ?? "").toLowerCase() === FIRMA_DEL_SISTEMA) return vencidoPorElSistema(d.decididoAt);
    return decidido(d.estado, d.decididoPorEmail, d.decididoAt);
  }
  return null;
}

// ── Sugerencia del handoff congelado (etapa 3b) ─────────────────────────────────────

/**
 * Una sugerencia de «Buscar lo nuevo» vive como un bloque en borrador del handoff. En borrador = pendiente (vencida a
 * los 30 días de la búsqueda); confirmada = usada; ya no está en el documento = desestimada. Usada y desestimada van
 * SIN FIRMA: el bloque no guarda quién la usó, y descartar lo borra, así que no se distingue de una sugerencia que
 * reemplazó otra búsqueda o «Rehacer desde cero» (`GUARDA` lo dice en «Uso de Nexus»).
 */
// ── Nota para HubSpot (etapa 5 de docs/mi-dia-plan.md) ─────────────────────────────

/**
 * La nota que Nexus sugiere después de una reunión: usada (se escribió) o descartada, con quién y cuándo; sin decidir,
 * pendiente por 30 días desde la reunión (el plazo de la tarjeta) y vencida después.
 */
export function estadoDeNotaParaHubspot(
  decision: { estado: "usada" | "descartada"; por: string; en: Date | string } | null,
  fechaDeLaReunion: Date | string,
  hoyISO: string,
): EstadoCalculado {
  if (decision) return decidido(decision.estado === "usada" ? "usado" : "desestimado", decision.por, decision.en);
  return sinDecidir(fechaDeLaReunion, hoyISO);
}

// ── Recomendación de recurrencia (SmartLoop, etapa 6 de docs/smartloop-plan.md) ──────────────────

/**
 * Pasar un servicio temporal a SmartLoop: usada (dejó la tarea o abrió el alta) o descartada, con quién y cuándo; sin
 * decidir, pendiente por 30 días desde que el proyecto llegó a su entrega (o cerró). `nacio` null = no se sabe cuándo
 * llegó: no vence.
 */
export function estadoDeRecomendacionDeRecurrencia(
  decision: { estado: "usada" | "descartada"; por: string; en: Date | string } | null,
  nacio: Date | string | null,
  hoyISO: string,
): EstadoCalculado {
  if (decision) return decidido(decision.estado === "usada" ? "usado" : "desestimado", decision.por, decision.en);
  if (!nacio) return { estado: "pendiente", sinFirma: false, decididoPor: null, decididoEn: null };
  return sinDecidir(nacio, hoyISO);
}

export function estadoDeSugerenciaDelHandoff(bloque: { status: string } | null, nacio: Date | string, hoyISO: string): EstadoCalculado {
  if (!bloque) return { estado: "desestimado", sinFirma: true, decididoPor: null, decididoEn: null };
  if (bloque.status === "DRAFT") return sinDecidir(nacio, hoyISO);
  return { estado: "usado", sinFirma: true, decididoPor: null, decididoEn: null };
}
