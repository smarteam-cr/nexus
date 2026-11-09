/**
 * lib/casos-de-uso/personalizar.ts — sugerir, aceptar y personalizar los casos de uso de la preventa. PURO.
 *
 * Pedido de Elías (2026-11-08, después de probar con Centauro): «lo más importante es ver qué casos de uso se sugieren y
 * por qué; luego, que la persona los acepte y ya aparezcan las actividades personalizadas». El paso queda en tres tiempos:
 *
 *   1. SUGERIR (el agente de casos, `pedidoDeCasos`): qué casos y por qué, con hechos del cliente. Ya no arma
 *      actividades: una tarjeta sugerida muestra las de su ficha del catálogo, y su precio desde ahí.
 *   2. ACEPTAR + PERSONALIZAR (`pedidoDePersonalizar`, una llamada por caso aceptado): el agente lee el contexto de la
 *      empresa (lo que puede ver el cliente, lo interno de la preventa y las reuniones del chokepoint de sesiones), la
 *      biblioteca de actividades y la ficha del caso, y deja las actividades para ESTA empresa, qué cambió frente a la
 *      ficha (`Personalizacion.cambios`, dos o tres líneas) y cómo subir el ticket. Nada de eso llega al cliente.
 *   3. REVISAR (el mismo agente de casos, con `revisar`): vuelve a mirar lo que hay con lo que se sabe hoy y DICE qué
 *      cambió (`RevisionDeLosCasos`), sin tocar lo elegido: lo nuevo queda sugerido y lo elegido solo se marca.
 *
 * Y quitar un elegido lo devuelve a los sugeridos con su porqué (`vuelveASugeridos`), salvo que el vendedor lo descarte.
 */
import { esObjeto, marcarCifrasAjenas, numerosEn, recortarSinCortarFrases } from "./armado";

// ── Personalizar ─────────────────────────────────────────────────────────────────────────────────

/** Lo que dejó la personalización de un caso aceptado. Interno: nunca llega a la propuesta del cliente. */
export interface Personalizacion {
  /** Cuándo (ISO). */
  en: string;
  /** Qué cambió frente a la ficha del catálogo y por qué, en dos o tres líneas cortas (en uno propio: cómo se armó). */
  cambios: string[];
}

/** Cuántas líneas de «qué cambió» y de qué largo: se leen de un vistazo (pedido 5 de Elías: «un resumen corto»). */
export const MAX_LINEAS_DE_CAMBIOS = 3;
export const LARGO_DE_UNA_LINEA_DE_CAMBIOS = 220;

/**
 * Las líneas de «qué cambió» que devolvió el agente: hasta tres, cortas, sin repetirse y con las cifras que no salieron
 * del cliente marcadas para confirmar (`contexto` es lo que leyó).
 */
export function validarCambiosDelAgente(raw: unknown, contexto: string): string[] {
  const conocidos = new Set(numerosEn(contexto));
  const vistas = new Set<string>();
  const out: string[] = [];
  for (const x of Array.isArray(raw) ? raw : []) {
    if (typeof x !== "string") continue;
    const linea = marcarCifrasAjenas(recortarSinCortarFrases(x, LARGO_DE_UNA_LINEA_DE_CAMBIOS), conocidos);
    const clave = linea.toLowerCase();
    if (!linea || vistas.has(clave)) continue;
    vistas.add(clave);
    out.push(linea);
    if (out.length >= MAX_LINEAS_DE_CAMBIOS) break;
  }
  return out;
}

/** Lo mínimo de un caso para saber si ya se personalizó o si es del vendedor. */
interface ParaPersonalizar {
  personalizado?: Personalizacion;
  aMano?: boolean;
  /** Lo armó «Regenerar» (antes de la personalización): ya tiene sus actividades para la empresa. */
  armado?: string;
}

/**
 * ¿Se personaliza solo al aceptarlo? Sí, salvo que ya venga personalizado (lo quitaron y lo volvieron a aceptar) o armado
 * por un «Regenerar» de antes, o que el vendedor ya le haya cambiado las actividades a mano (son suyas: «Volver a
 * personalizar» lo pide él). La misma regla que usa la fila para no ofrecer «Personalizar».
 */
export function sePersonalizaAlAceptar(caso: ParaPersonalizar): boolean {
  return !caso.personalizado && !caso.armado && !caso.aMano;
}

/**
 * La versión personalizada que dejó el agente se usa sola si el caso sigue elegido y nadie le cambió las actividades a
 * mano mientras tanto. Si no, queda en su fila como «versión nueva» y decide el vendedor.
 */
export function laPersonalizacionSeUsaSola(elegido: ParaPersonalizar | undefined): boolean {
  return !!elegido && !elegido.aMano;
}

// ── Quitar un elegido ────────────────────────────────────────────────────────────────────────────

/**
 * Pedido 4 de Elías (2026-11-08): «quité los casos que ya estaban seleccionados y no volvieron a los sugeridos;
 * deberían». Vuelve a los sugeridos el que propuso el agente (trae su descripción, o su id es `ia-…`); uno elegido a mano
 * del catálogo vuelve solo a la lista del catálogo, como siempre (ahí ya está).
 */
export function vuelveASugeridos(useCaseId: string, caso: { descripcion?: string; plan?: unknown }): boolean {
  // No por `paraVentas`: la personalización se lo pone también a uno elegido a mano (revisión del 2026-11-08).
  return useCaseId.startsWith("ia-") || !!caso.descripcion?.trim() || !!caso.plan;
}

// ── Revisar ──────────────────────────────────────────────────────────────────────────────────────

export const VEREDICTOS_DE_LA_REVISION = ["cambia", "ya_no"] as const;
export type VeredictoDeLaRevision = (typeof VEREDICTOS_DE_LA_REVISION)[number];

/** Un caso que ya estaba y que, con lo que se sabe hoy, cambia o ya no hace falta. */
export interface CambioDeLaRevision {
  useCaseId: string;
  titulo: string;
  /** Estaba elegido (si no, era una sugerencia). */
  elegido: boolean;
  veredicto: VeredictoDeLaRevision;
  /** Por qué, en una frase con hechos del cliente. */
  motivo: string;
}

/**
 * La última vez que el agente miró los casos (sugerir o revisar). La huella de lo que leyó dice, después, si cambió algo
 * (la escala o lo que se sabe del cliente) para avisarlo arriba. `revisada`: la pidió «Revisar» y trae su resultado.
 */
export interface RevisionDeLosCasos {
  en: string;
  corridaId: string;
  huella: string;
  revisada: boolean;
  /** Los títulos de los casos nuevos que dejó sugeridos. */
  nuevos: string[];
  cambios: CambioDeLaRevision[];
}

/** Lo que devolvió el agente en «revision», validado: solo casos que ya estaban, uno por caso, con su motivo. */
export function validarRevisionDelAgente(
  raw: unknown,
  yaEstaban: readonly { useCaseId: string; titulo: string; elegido: boolean }[],
  contexto: string,
): CambioDeLaRevision[] {
  const porId = new Map(yaEstaban.map((c) => [c.useCaseId, c]));
  const conocidos = new Set(numerosEn(contexto));
  const vistos = new Set<string>();
  const out: CambioDeLaRevision[] = [];
  for (const x of Array.isArray(raw) ? raw : []) {
    if (!esObjeto(x) || typeof x.id !== "string") continue;
    const caso = porId.get(x.id);
    const veredicto = (VEREDICTOS_DE_LA_REVISION as readonly unknown[]).includes(x.veredicto) ? (x.veredicto as VeredictoDeLaRevision) : null;
    const motivo = typeof x.motivo === "string" ? marcarCifrasAjenas(recortarSinCortarFrases(x.motivo, 240), conocidos) : "";
    if (!caso || !veredicto || !motivo || vistos.has(caso.useCaseId)) continue;
    vistos.add(caso.useCaseId);
    out.push({ useCaseId: caso.useCaseId, titulo: caso.titulo, elegido: caso.elegido, veredicto, motivo });
  }
  return out;
}

/** «Nada cambió»: ni casos nuevos ni ninguno de los que ya estaban cambia. */
export function nadaCambio(r: Pick<RevisionDeLosCasos, "nuevos" | "cambios">): boolean {
  return r.nuevos.length === 0 && r.cambios.length === 0;
}

/** La revisión en una frase, para el aviso de arriba. */
export function revisionEnUnaFrase(r: Pick<RevisionDeLosCasos, "nuevos" | "cambios">): string {
  if (nadaCambio(r)) return "Nada cambió: con lo que se sabe hoy, los casos siguen siendo los mismos.";
  const partes: string[] = [];
  if (r.nuevos.length) partes.push(r.nuevos.length === 1 ? "1 caso nuevo sugerido" : `${r.nuevos.length} casos nuevos sugeridos`);
  const cambian = r.cambios.filter((c) => c.veredicto === "cambia").length;
  const yaNo = r.cambios.filter((c) => c.veredicto === "ya_no").length;
  if (cambian) partes.push(cambian === 1 ? "1 caso cambiaría" : `${cambian} casos cambiarían`);
  if (yaNo) partes.push(yaNo === 1 ? "1 ya no parece hacer falta" : `${yaNo} ya no parecen hacer falta`);
  return `${partes.join(", ")}. Lo elegido no se tocó.`;
}

// ── Lo nuevo desde la última mirada ──────────────────────────────────────────────────────────────

/**
 * La huella de lo que lee el agente de casos (la escala, lo que le falta, metas y retos, las áreas): si cambia, cambió lo
 * que se sabe. FNV-1a de 32 bits: corta, estable y sin dependencias (client-safe).
 */
export function huellaDeLoQueLee(exploracion: string, areas: readonly string[]): string {
  const s = `${[...areas].sort().join(",")}\n${exploracion}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Lo que llegó después de la última vez que el agente miró los casos: lo que hace que valga la pena revisar. */
export interface NovedadesDeLosCasos {
  /** Desde cuándo (ISO): la última vez que el agente miró los casos. */
  desde: string;
  /** Reuniones de la preventa que el agente leyó después. */
  reuniones: number;
  /** La escala o lo que se sabe del cliente cambió (la huella de lo que lee el agente es otra). */
  cambioLoQueSeSabe: boolean;
}

/**
 * Las novedades desde la última mirada, o null si no hay ninguna (o el agente nunca miró: ahí el paso ya invita a
 * proponer). Sin huella guardada (una mirada de antes del 2026-11-08), solo cuentan las reuniones.
 */
export function novedadesDesde(o: {
  ultima: Pick<RevisionDeLosCasos, "en" | "huella"> | null;
  huellaDeHoy: string;
  fechasDeReuniones: readonly number[];
}): NovedadesDeLosCasos | null {
  if (!o.ultima) return null;
  const desde = Date.parse(o.ultima.en);
  if (!Number.isFinite(desde)) return null;
  const reuniones = o.fechasDeReuniones.filter((f) => f > desde).length;
  const cambioLoQueSeSabe = !!o.ultima.huella && o.ultima.huella !== o.huellaDeHoy;
  return reuniones > 0 || cambioLoQueSeSabe ? { desde: o.ultima.en, reuniones, cambioLoQueSeSabe } : null;
}

/** Las novedades en una frase: «Desde la última revisión: 2 reuniones nuevas y cambió la escala». */
export function novedadesEnUnaFrase(n: Pick<NovedadesDeLosCasos, "reuniones" | "cambioLoQueSeSabe">): string {
  const partes: string[] = [];
  if (n.reuniones) partes.push(n.reuniones === 1 ? "se leyó 1 reunión nueva" : `se leyeron ${n.reuniones} reuniones nuevas`);
  if (n.cambioLoQueSeSabe) partes.push("cambió la escala o lo que se sabe del cliente");
  return `Desde la última vez que el agente miró los casos ${partes.join(" y ")}.`;
}
