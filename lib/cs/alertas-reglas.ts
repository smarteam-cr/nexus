/**
 * lib/cs/alertas-reglas.ts — cuándo una alerta de Éxito del cliente se cierra y cuándo vuelve
 * (2026-10-07). PURO.
 *
 * Pedido de Elías: las alertas se acumulaban (105 abiertas en 27 cuentas, ninguna cerrada nunca).
 * Cada alerta se resuelve o se descarta con una nota corta, y «si vuelve a aparecer una señal nueva
 * sobre lo mismo, la alerta vuelve a salir». La rutina es que Alex Vanegas (CSL) la revise los
 * primeros 10 minutos del día: la lista solo puede mostrar lo que de verdad pide atención.
 *
 * ── CUÁNDO VUELVE ────────────────────────────────────────────────────────────────────────────
 * El agente vigía vuelve a ver el mismo hecho todos los días que la cuenta tiene novedades. Antes,
 * una alerta cerrada se callaba 7 días y después nacía otra igual aunque nada hubiera cambiado: el
 * feed se volvía a llenar solo. Ahora una alerta cerrada vuelve SOLO con una señal nueva:
 *   · el agente la ve más grave que cuando se cerró, o
 *   · trae evidencia que no estaba cuando se cerró (otra reunión, otro evento del cronograma, otra
 *     tarea, otro negocio).
 * Vuelve como alerta nueva: la cerrada queda en el historial con su nota.
 */

import { normalizarParaCita } from "@/lib/timeline/limites";
import { fmtDia } from "./formato";

export type EstadoDeAlerta = "OPEN" | "SEEN" | "RESOLVED" | "DISMISSED";
export type SeveridadDeAlerta = "LOW" | "MEDIUM" | "HIGH";

const RANGO: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

/** Las listas de evidencia que nombran cosas concretas (lo que hace «nueva» a una señal). */
const LISTAS_DE_EVIDENCIA = ["sessionIds", "eventIds", "taskIds", "dealIds"] as const;

/** Los ids que cita la evidencia de una alerta, como `sessionIds:abc`. Lo que no es lista se ignora. */
export function idsDeLaEvidencia(evidencia: unknown): Set<string> {
  const out = new Set<string>();
  if (!evidencia || typeof evidencia !== "object" || Array.isArray(evidencia)) return out;
  const e = evidencia as Record<string, unknown>;
  for (const lista of LISTAS_DE_EVIDENCIA) {
    const v = e[lista];
    if (!Array.isArray(v)) continue;
    for (const id of v) if (typeof id === "string" && id.trim()) out.add(`${lista}:${id.trim()}`);
  }
  // La frase verificada de una queja o un retraso (2026-10-09): otra reunión u otro correo es evidencia nueva.
  const cita = e.cita as { verificada?: unknown; id?: unknown } | undefined;
  if (cita?.verificada === true && typeof cita.id === "string" && cita.id.trim()) out.add(`cita:${cita.id.trim()}`);
  return out;
}

/** ¿La evidencia nueva cita algo que la vieja no citaba? */
export function traeEvidenciaNueva(nueva: unknown, vieja: unknown): boolean {
  const antes = idsDeLaEvidencia(vieja);
  for (const id of idsDeLaEvidencia(nueva)) if (!antes.has(id)) return true;
  return false;
}

export type QueHacerConLaAlerta = "crear" | "actualizar" | "suprimir";

/**
 * El agente volvió a ver un hecho (misma llave). Qué hacer según la última alerta de esa llave.
 *   · ninguna → crear
 *   · abierta o vista → actualizar la misma (no duplicar)
 *   · cerrada → crear SOLO con una señal nueva (más grave o con evidencia nueva); si no, suprimir.
 */
export function queHacerConLaRedeteccion(
  existente: { status: EstadoDeAlerta | string; severity: SeveridadDeAlerta | string; evidence: unknown } | null,
  nueva: { severity: SeveridadDeAlerta | string; evidence: unknown },
): QueHacerConLaAlerta {
  if (!existente) return "crear";
  if (existente.status === "OPEN" || existente.status === "SEEN") return "actualizar";
  if ((RANGO[nueva.severity] ?? 0) > (RANGO[existente.severity] ?? 0)) return "crear";
  if (traeEvidenciaNueva(nueva.evidence, existente.evidence)) return "crear";
  return "suprimir";
}

/** La cita verificada de una evidencia: el id de la reunión o del correo y la frase normalizada. */
function citaVerificadaDe(e: unknown): { id: string; frase: string } | null {
  const c = (e as { cita?: { verificada?: unknown; id?: unknown; texto?: unknown } } | null)?.cita;
  if (c?.verificada !== true || typeof c.id !== "string" || !c.id.trim() || typeof c.texto !== "string") return null;
  const frase = normalizarParaCita(c.texto).replace(/[.…]+$/, "").trim();
  return frase.length >= 12 ? { id: c.id.trim(), frase } : null;
}

/**
 * ¿Dos alertas son la MISMA queja? Mismo cliente, misma categoría, la misma reunión o correo (`evidence.cita.id`) y la
 * misma frase verificada (una contiene a la otra: cada detector corta la cita a su manera). Un solo sistema de alertas
 * con dos detectores que leen reuniones (la lectura de cada reunión y el vigía, DECISIONS «Un solo sistema de alertas,
 * con tres detectores»): sin esto, la misma queja dicha en la misma reunión salía dos veces, una por cada detector. Dos
 * quejas distintas de la misma reunión NO son la misma. Lo usan los dos escritores antes de crear, SOLO para la queja
 * (la única que levantan los dos): si hay una gemela abierta, la actualizan.
 */
export function mismaCitaVerificada(
  a: { clientId: string; category: string; evidence: unknown },
  b: { clientId: string; category: string; evidence: unknown },
): boolean {
  if (a.clientId !== b.clientId || a.category !== b.category) return false;
  const ca = citaVerificadaDe(a.evidence);
  const cb = citaVerificadaDe(b.evidence);
  if (!ca || !cb || ca.id !== cb.id) return false;
  return ca.frase.includes(cb.frase) || cb.frase.includes(ca.frase);
}

/** Las listas de ids que se acumulan al juntar dos evidencias de la misma alerta. */
const LISTAS_QUE_SE_JUNTAN = [...LISTAS_DE_EVIDENCIA, "hechoIds"] as const;

/**
 * Junta la evidencia de una alerta que se vuelve a ver con la que ya tenía: las listas de ids (reuniones, eventos,
 * hechos…) se acumulan y la cita queda la más reciente. Sin esto, actualizar una alerta perdía las reuniones de antes,
 * y al cerrarla, volver a ver la reunión vieja contaba como «evidencia nueva» y la reabría.
 */
export function juntarEvidencia(vieja: unknown, nueva: unknown): Record<string, unknown> {
  const v = vieja && typeof vieja === "object" && !Array.isArray(vieja) ? (vieja as Record<string, unknown>) : {};
  const n = nueva && typeof nueva === "object" && !Array.isArray(nueva) ? (nueva as Record<string, unknown>) : {};
  const out: Record<string, unknown> = { ...v, ...n };
  for (const lista of LISTAS_QUE_SE_JUNTAN) {
    const ids = [v[lista], n[lista]].flatMap((x) => (Array.isArray(x) ? x.filter((id): id is string => typeof id === "string" && !!id.trim()) : []));
    if (ids.length) out[lista] = [...new Set(ids)];
  }
  if (!n.cita && v.cita) out.cita = v.cita;
  return out;
}

/** Una nota corta: una línea, sin espacios de más. */
export const LARGO_DE_LA_NOTA = 280;

/** La nota que se guarda: recortada a una línea y al largo máximo. "" o solo espacios → null. */
export function notaDeCierre(nota: unknown): string | null {
  if (typeof nota !== "string") return null;
  const limpia = nota.replace(/\s+/g, " ").trim();
  if (!limpia) return null;
  return limpia.length > LARGO_DE_LA_NOTA ? `${limpia.slice(0, LARGO_DE_LA_NOTA - 1).trimEnd()}…` : limpia;
}

/** Quién firma lo que cierra Nexus solo (un aviso de renovación que ya no corresponde). */
export const CIERRE_DEL_SISTEMA = "sistema";

/**
 * Los avisos de renovación abiertos que ya no corresponden: su llave no es la de ningún aviso que
 * toque hoy (la renovación pasó, cambió de fecha o ya cruzó al umbral siguiente, que tiene su propio
 * aviso). Se cierran solos para que el feed no junte el de 90, el de 60 y el de 30 de la misma fecha.
 */
export function avisosQueYaNoCorresponden(
  abiertos: ReadonlyArray<{ id: string; dedupeKey: string }>,
  llavesDeHoy: ReadonlySet<string>,
): string[] {
  return abiertos.filter((a) => !llavesDeHoy.has(a.dedupeKey)).map((a) => a.id);
}

/** Cómo se cerró una alerta: para mostrarla junto a la que volvió y en el historial de cerradas. */
export interface CierreAnterior {
  estado: "RESOLVED" | "DISMISSED";
  /** AAAA-MM-DD en Costa Rica («» si la fila no trae la fecha). */
  fecha: string;
  nota: string | null;
  /** Correo de quien la cerró; `CIERRE_DEL_SISTEMA` = se cerró sola. */
  quien: string | null;
}

/** El día en Costa Rica (UTC−6, sin horario de verano) de un instante. */
export function diaDelCierre(instante: Date | string | null): string {
  if (!instante) return "";
  const ms = typeof instante === "string" ? Date.parse(instante) : instante.getTime();
  return Number.isNaN(ms) ? "" : new Date(ms - 6 * 3_600_000).toISOString().slice(0, 10);
}

/** «Resuelta el 3 oct por aarrieta: «Llamé a Mariana».» · «Se cerró sola el 3 oct: …». */
export function textoDelCierre(c: CierreAnterior, hoy: string): string {
  const cuando = c.fecha ? ` el ${fmtDia(c.fecha, hoy)}` : "";
  const nota = c.nota ? `: «${c.nota}»` : "";
  if (c.quien === CIERRE_DEL_SISTEMA) return `Se cerró sola${cuando}${nota}`;
  const quien = c.quien ? ` por ${c.quien.split("@")[0]}` : "";
  return `${c.estado === "RESOLVED" ? "Resuelta" : "Descartada"}${cuando}${quien}${nota}`;
}
