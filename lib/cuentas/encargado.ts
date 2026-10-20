/**
 * lib/cuentas/encargado.ts — QUIÉN LLEVA UNA CUENTA, en un solo lugar (2026-10-19). PURO.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────────────────────────
 * Hasta este día había seis respuestas distintas a «¿quién es el CSE de esta cuenta?»: el listado de clientes juntaba
 * los dueños de todos los proyectos de CS activos, Éxito del cliente contaba también los de Desarrollo, la carga
 * contaba los de la cartera, la lectura de cada reunión contaba los de la cartera, «Para ti» tomaba el primero que
 * encontraba y la adopción daba por CSE a quien llevó un proyecto ya cerrado. En Librería Internacional (2026-10-19)
 * eso se vio: una fila de un proyecto fusionado en HubSpot seguía activa con Heiver Gómez y el listado lo mostraba
 * primero, aunque en HubSpot la cuenta fuera de Caroline Bersot.
 *
 * ── LA REGLA ─────────────────────────────────────────────────────────────────────────────────────
 * Cuentan solo los proyectos que DEFINEN el encargado (`proyectoQueDefine`): activos, del pipeline de Customer Success
 * (implementación o servicio recurrente; nunca Desarrollo ni Sitios web, que tienen su encargado técnico), con su
 * registro en HubSpot y con dueño. De esos:
 *   · el encargado es quien lleva MÁS proyectos;
 *   · con empate, el del proyecto creado más recién en HubSpot (`creadoAt`): un dato fijo, así el empate no cambia
 *     según qué proyecto se sincronizó último (revisión del 2026-10-19). Después, por correo;
 *   · quien está dado de baja en Nexus no lleva nada: si nadie más lleva la cuenta, queda sin encargado y se dice de
 *     quién era (`deBaja`).
 * El encargado de UN proyecto sigue siendo su dueño en HubSpot (`Project.hubspotOwnerEmail`): eso no cambia.
 *
 * El servidor (lee la base): ./encargado-server.ts.
 */
import { esProyectoDePipelineCS, type ProyectoParaFiltro } from "@/lib/projects/scope";

export interface PersonaQueLleva {
  email: string;
  nombre: string;
}

/** Un proyecto, como lo mira esta regla. */
export interface ProyectoQueLleva {
  activo: boolean;
  /** Del pipeline de Customer Success (implementación o servicio recurrente). */
  deCs: boolean;
  /** Tiene su registro en HubSpot (`hubspotServiceId`). */
  deHubspot: boolean;
  email: string | null;
  nombre: string | null;
  /** Cuándo se creó el proyecto en HubSpot (ms, Date o ISO). Solo desempata: gana el más nuevo. */
  creadoAt?: number | string | Date | null;
}

export interface EncargadoDeLaCuenta {
  /** null = nadie del equipo activo lleva la cuenta. */
  email: string | null;
  nombre: string | null;
  /** Sin encargado activo: el nombre de quien la llevaba y está de baja. */
  deBaja: string | null;
  /** Los demás que llevan algún proyecto de CS activo de la cuenta (no el encargado), sin los de baja. */
  otros: PersonaQueLleva[];
}

export type FilaParaElEncargado = ProyectoParaFiltro & {
  hubspotOwnerEmail: string | null;
  hubspotOwnerName: string | null;
  hubspotCreatedAt?: Date | null;
};

export function proyectoQueLleva(p: FilaParaElEncargado): ProyectoQueLleva {
  return {
    activo: p.status === "active",
    deCs: esProyectoDePipelineCS(p),
    deHubspot: !!p.hubspotServiceId,
    email: p.hubspotOwnerEmail,
    nombre: p.hubspotOwnerName,
    creadoAt: p.hubspotCreatedAt ?? null,
  };
}

export const SIN_ENCARGADO: EncargadoDeLaCuenta = { email: null, nombre: null, deBaja: null, otros: [] };

const norm = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();

function ms(v: ProyectoQueLleva["creadoAt"]): number {
  if (v == null) return 0;
  const n = v instanceof Date ? v.getTime() : typeof v === "number" ? v : Date.parse(v);
  return Number.isFinite(n) ? n : 0;
}

/** ¿Este proyecto decide quién lleva la cuenta? */
export function proyectoQueDefine(p: ProyectoQueLleva): boolean {
  return p.activo && p.deCs && p.deHubspot && norm(p.email).length > 0;
}

interface Conteo {
  email: string;
  nombre: string;
  n: number;
  ultimo: number;
}

function contar(ps: readonly ProyectoQueLleva[], filtro: (email: string) => boolean): Conteo[] {
  const m = new Map<string, Conteo>();
  for (const p of ps) {
    if (!proyectoQueDefine(p)) continue;
    const email = norm(p.email);
    if (!filtro(email)) continue;
    const c = m.get(email) ?? { email, nombre: (p.nombre ?? "").trim() || email, n: 0, ultimo: 0 };
    c.n++;
    c.ultimo = Math.max(c.ultimo, ms(p.creadoAt));
    m.set(email, c);
  }
  return [...m.values()].sort((a, b) => b.n - a.n || b.ultimo - a.ultimo || a.email.localeCompare(b.email));
}

/**
 * Quién lleva la cuenta. `deBaja`: correo (minúsculas) → nombre de quienes están dados de baja en Nexus.
 * `nombres` (opcional): correo → nombre en Nexus, que gana sobre el nombre que trae HubSpot.
 */
export function encargadoDeLaCuenta(
  proyectos: readonly ProyectoQueLleva[],
  deBaja: ReadonlyMap<string, string> = new Map(),
  nombres: ReadonlyMap<string, string> = new Map(),
): EncargadoDeLaCuenta {
  const vivos = contar(proyectos, (e) => !deBaja.has(e));
  const nombre = (c: Conteo) => nombres.get(c.email) ?? c.nombre;
  if (vivos.length === 0) {
    const muertos = contar(proyectos, (e) => deBaja.has(e));
    return { ...SIN_ENCARGADO, deBaja: muertos[0] ? (deBaja.get(muertos[0].email) ?? nombre(muertos[0])) : null };
  }
  const [primero, ...resto] = vivos;
  return { email: primero.email, nombre: nombre(primero), deBaja: null, otros: resto.map((c) => ({ email: c.email, nombre: nombre(c) })) };
}

/** Todos los que llevan algún proyecto de CS activo de la cuenta, el encargado primero. Sin los de baja. */
export function quienesLlevanLaCuenta(
  proyectos: readonly ProyectoQueLleva[],
  deBaja: ReadonlyMap<string, string> = new Map(),
  nombres: ReadonlyMap<string, string> = new Map(),
): PersonaQueLleva[] {
  const e = encargadoDeLaCuenta(proyectos, deBaja, nombres);
  return e.email ? [{ email: e.email, nombre: e.nombre ?? e.email }, ...e.otros] : [];
}

/** ¿Esta persona lleva la cuenta (el encargado o alguien con un proyecto de CS activo)? */
export function llevaLaCuenta(proyectos: readonly ProyectoQueLleva[], email: string | null | undefined, deBaja: ReadonlyMap<string, string> = new Map()): boolean {
  const e = norm(email);
  return !!e && quienesLlevanLaCuenta(proyectos, deBaja).some((p) => p.email === e);
}
