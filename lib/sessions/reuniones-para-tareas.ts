/**
 * lib/sessions/reuniones-para-tareas.ts — las reuniones que lee Tareas internas. Lector del CHOKEPOINT. SERVIDOR.
 *
 * Tareas no lee `FirefliesSession` por su cuenta (invariante #1): pasa por acá, que decide QUIÉN puede leer QUÉ
 * reunión con la misma regla de dueño que el resto de Nexus (`belongsToClient` / `resolvedClientId`).
 *
 *   · Una reunión de PUERTAS ADENTRO (todos los participantes de la casa) o cuyo dueño es una empresa INTERNO (como
 *     «SPRINT COMERCIAL | SMARTEAM»): la lee quien estuvo o quien la organizó.
 *   · Una reunión con dueño CLIENTE: además, ese cliente tiene que estar entre los que la persona ve
 *     (`clientesQueVesParaTareas`). Tareas nunca la adopta ni le cambia el dueño.
 *   · La sala nunca se decide por `resolvedClientId` solo: «puertas adentro» lo dicen los dominios de quienes estuvieron.
 *
 * Desde acá nunca se escribe `manualClientId`, `SessionProject` ni el dueño de una reunión (docs/tareas-plan.md §8).
 *
 * La transcripción entera no sale de acá: el nivel 2 de la lectura (`conversacionParaTareas`) recibe lo DICHO,
 * comprimido y numerado por turno (lib/sessions/conversacion.ts), con la misma regla de quién puede leer la reunión.
 */
import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getSessionCategories } from "@/lib/cache/session-categories";
import { buildInternalDomainsSet } from "./categorize";
import { esReunionDePuertasAdentro } from "./candidatas-internas";
import { comprimirConversacion, type ConversacionComprimida } from "./conversacion";
import { MAX_TRANSCRIPT_CHARS } from "@/lib/google/doc-parse";

export interface QuienLeeReuniones {
  email: string;
  esSuperAdmin: boolean;
  /** Las empresas que ve (ids), o todas. */
  clientes: { todos: boolean; ids: ReadonlySet<string>; porId: ReadonlyMap<string, { kind: string; nombre: string }> };
}

export interface ReunionParaTareas {
  id: string;
  titulo: string;
  inicio: Date;
  fin: Date;
  /** Con el organizador incluido, en minúsculas. */
  participantes: string[];
  organizador: string | null;
  /** Las notas de Gemini (`summary.overview`), si hay. */
  notas: string | null;
  /** `summary.action_items`, si los trae. */
  actionItems: string[];
  largoTranscript: number;
  /** Huella del texto: dos filas de la misma reunión (dos series) se leen una vez. null con menos de 200 caracteres. */
  huellaTexto: string | null;
  /** La base del `googleEventId` (antes del «_»): la serie de una reunión recurrente. */
  serie: string | null;
  /** El dueño de la reunión (`resolvedClientId`, o el override manual). */
  duenoClienteId: string | null;
  duenoClienteNombre: string | null;
  /** Sin cliente dueño (o con dueño INTERNO) y todos de la casa. */
  puertasAdentro: boolean;
  /** Quien pide estuvo (o la organizó). */
  estuvo: boolean;
}

const SELECT = {
  id: true,
  title: true,
  date: true,
  duration: true,
  participants: true,
  organizerEmail: true,
  summary: true,
  transcript: true,
  googleEventId: true,
  resolvedClientId: true,
  manualClientId: true,
} satisfies Prisma.FirefliesSessionSelect;

type Fila = Prisma.FirefliesSessionGetPayload<{ select: typeof SELECT }>;

/** La serie de un evento recurrente: «07iqe725…_20261005T153000Z» → «07iqe725…». */
export function serieDe(googleEventId: string | null): string | null {
  if (!googleEventId) return null;
  const i = googleEventId.indexOf("_");
  return i > 0 ? googleEventId.slice(0, i) : googleEventId;
}

function huella(texto: string | null | undefined): string | null {
  const t = (texto ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  if (t.length < 200) return null;
  return createHash("md5").update(t).digest("hex");
}

function leerResumen(summary: unknown): { notas: string | null; actionItems: string[] } {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return { notas: null, actionItems: [] };
  const s = summary as Record<string, unknown>;
  const notas = typeof s.overview === "string" && s.overview.trim() ? s.overview : null;
  const actionItems = Array.isArray(s.action_items) ? s.action_items.filter((a): a is string => typeof a === "string" && !!a.trim()) : [];
  return { notas, actionItems };
}

async function aReunion(f: Fila, q: QuienLeeReuniones, dominiosPropios: ReadonlySet<string>): Promise<ReunionParaTareas | null> {
  const yo = q.email.toLowerCase();
  const participantes = [...new Set([...f.participants, ...(f.organizerEmail ? [f.organizerEmail] : [])].map((p) => p.toLowerCase()))];
  const estuvo = participantes.includes(yo);
  const dueno = f.resolvedClientId ?? f.manualClientId ?? null;
  const empresa = dueno ? q.clientes.porId.get(dueno) : null;
  const duenoInterno = !!empresa && empresa.kind === "INTERNO";
  const salaPropia = esReunionDePuertasAdentro({ participants: f.participants, organizerEmail: f.organizerEmail } as never, dominiosPropios);
  const puertasAdentro = salaPropia && (!dueno || duenoInterno);

  // Quién puede leerla.
  if (!q.esSuperAdmin) {
    if (!estuvo) return null;
    if (dueno && !duenoInterno && !q.clientes.ids.has(dueno)) return null;
  }

  const { notas, actionItems } = leerResumen(f.summary);
  return {
    id: f.id,
    titulo: f.title,
    inicio: f.date,
    fin: new Date(+f.date + Math.max(15, f.duration || 30) * 60_000),
    participantes,
    organizador: f.organizerEmail?.toLowerCase() ?? null,
    notas,
    actionItems,
    largoTranscript: f.transcript?.length ?? 0,
    huellaTexto: huella(f.transcript) ?? huella(notas),
    serie: serieDe(f.googleEventId),
    duenoClienteId: dueno,
    duenoClienteNombre: empresa?.nombre ?? null,
    puertasAdentro,
    estuvo,
  };
}

async function dominiosDeLaCasa(): Promise<Set<string>> {
  // Fuera de un pedido de Next (un script, el ensayo) no hay caché incremental: la misma consulta, directa.
  const categorias = await getSessionCategories().catch(() =>
    prisma.sessionCategory.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true, slug: true, domains: true, kind: true, color: true } }),
  );
  return buildInternalDomainsSet(categorias);
}

/**
 * Las reuniones que una persona puede leer para tareas: por id (la que eligió), o las suyas de un rango. Solo las que
 * ya ocurrieron. La transcripción entera NO viaja: solo su largo y su huella.
 */
export async function getReunionesParaTareas(o: {
  quien: QuienLeeReuniones;
  ids?: readonly string[];
  desde?: Date;
  hasta?: Date;
  /** Buscar por título. */
  q?: string;
  tope?: number;
}): Promise<ReunionParaTareas[]> {
  if (o.ids && o.ids.length === 0) return [];
  const ahora = new Date();
  // Solo lo que ya ocurrió: una reunión agendada no dejó nada que leer (y un `hasta` futuro no la destapa).
  const techo = o.hasta && o.hasta < ahora ? o.hasta : ahora;
  const yo = o.quien.email.toLowerCase();
  const where: Prisma.FirefliesSessionWhereInput = {
    date: { lte: techo, ...(o.desde ? { gte: o.desde } : {}) },
    ...(o.ids ? { id: { in: [...o.ids] } } : {}),
    ...(o.q && o.q.trim().length >= 2 ? { title: { contains: o.q.trim(), mode: "insensitive" } } : {}),
    // Sin ids, solo las suyas: no se recorre la base entera.
    ...(o.ids ? {} : { OR: [{ participants: { has: yo } }, { organizerEmail: yo }] }),
  };
  const filas = await prisma.firefliesSession.findMany({ where, select: SELECT, orderBy: { date: "desc" }, take: o.tope ?? 40 });
  const dominios = await dominiosDeLaCasa();
  const salida: ReunionParaTareas[] = [];
  for (const f of filas) {
    const r = await aReunion(f, o.quien, dominios);
    if (r) salida.push(r);
  }
  return salida;
}

/**
 * Las reuniones recientes de la persona para «Leer una reunión»: las de puertas adentro primero, de las últimas 4
 * semanas, con su gemela marcada (la misma reunión en dos filas: se ofrece la que tiene notas más largas).
 */
export async function reunionesDeTuCalendarioParaTareas(quien: QuienLeeReuniones, q?: string): Promise<(ReunionParaTareas & { gemelaDe: string | null })[]> {
  const desde = new Date(Date.now() - 35 * 86_400_000);
  const reuniones = await getReunionesParaTareas({ quien, desde: q ? undefined : desde, q, tope: 60 });
  const porHuella = new Map<string, ReunionParaTareas>();
  for (const r of reuniones) {
    if (!r.huellaTexto) continue;
    const otra = porHuella.get(r.huellaTexto);
    if (!otra || (r.notas?.length ?? 0) > (otra.notas?.length ?? 0)) porHuella.set(r.huellaTexto, r);
  }
  return reuniones.map((r) => {
    const mejor = r.huellaTexto ? porHuella.get(r.huellaTexto) : null;
    return { ...r, gemelaDe: mejor && mejor.id !== r.id ? mejor.id : null };
  });
}

export interface SalaDeLaReunion {
  titulo: string;
  inicio: Date;
  puertasAdentro: boolean;
  estuvo: boolean;
  /**
   * Es de un cliente que quien mira ve (o de puertas adentro). ⚠ Una reunión sin dueño resuelto también cuenta como
   * visible: para la regla del CONTEXTO eso no alcanza (ver `conDueno`).
   */
  clienteVisible: boolean;
  /** La reunión tiene un dueño resuelto (un cliente o Smarteam). Sin dueño, no se sabe de quién es lo que se habló. */
  conDueno: boolean;
}

/**
 * Para mostrar la CITA de una tarea: la sala de cada reunión, vista por quien mira, en una sola consulta. La regla de
 * quién ve la cita la aplica lib/tareas/serializar.ts con esto; el dueño de la reunión se lee al momento, así una
 * corrección de `resolvedClientId` vale también para lo viejo.
 */
export async function salasDeReuniones(quien: QuienLeeReuniones, ids: readonly string[]): Promise<Map<string, SalaDeLaReunion>> {
  const unicos = [...new Set(ids)];
  if (!unicos.length) return new Map();
  const filas = await prisma.firefliesSession.findMany({
    where: { id: { in: unicos } },
    select: { id: true, title: true, date: true, participants: true, organizerEmail: true, resolvedClientId: true, manualClientId: true },
  });
  const dominios = await dominiosDeLaCasa();
  const yo = quien.email.toLowerCase();
  const salida = new Map<string, SalaDeLaReunion>();
  for (const f of filas) {
    const participantes = [...f.participants, ...(f.organizerEmail ? [f.organizerEmail] : [])].map((p) => p.toLowerCase());
    const dueno = f.resolvedClientId ?? f.manualClientId ?? null;
    const empresa = dueno ? quien.clientes.porId.get(dueno) : null;
    const duenoInterno = !!empresa && empresa.kind === "INTERNO";
    const salaPropia = esReunionDePuertasAdentro({ participants: f.participants, organizerEmail: f.organizerEmail } as never, dominios);
    salida.set(f.id, {
      titulo: f.title,
      inicio: f.date,
      puertasAdentro: salaPropia && (!dueno || duenoInterno),
      estuvo: participantes.includes(yo),
      clienteVisible: quien.esSuperAdmin || !dueno || duenoInterno || quien.clientes.ids.has(dueno),
      conDueno: !!dueno,
    });
  }
  return salida;
}

/**
 * El dueño de cada reunión, para la guarda de Tareas: una tarea con la cita de una reunión de un cliente no puede pasar
 * a ser de OTRO cliente (INV42). `interno` = el dueño es Smarteam (una reunión interna no ata a nadie).
 */
export async function duenosDeReuniones(ids: readonly string[]): Promise<Map<string, { clientId: string | null; interno: boolean }>> {
  const unicos = [...new Set(ids)];
  if (!unicos.length) return new Map();
  const filas = await prisma.firefliesSession.findMany({ where: { id: { in: unicos } }, select: { id: true, resolvedClientId: true, manualClientId: true } });
  const duenos = [...new Set(filas.map((f) => f.resolvedClientId ?? f.manualClientId).filter((x): x is string => !!x))];
  const internos = new Set(
    (duenos.length ? await prisma.client.findMany({ where: { id: { in: duenos }, kind: "INTERNO" }, select: { id: true } }) : []).map((c) => c.id),
  );
  return new Map(
    filas.map((f) => {
      const dueno = f.resolvedClientId ?? f.manualClientId ?? null;
      return [f.id, { clientId: dueno, interno: !!dueno && internos.has(dueno) }];
    }),
  );
}

/** Hasta cuánto de la conversación se lee (el mismo tope que la transcripción guardada). */
export const MAX_CONVERSACION_PARA_TAREAS = MAX_TRANSCRIPT_CHARS;

/**
 * Lo DICHO en una reunión, para el nivel 2 de la lectura de tareas (docs/tareas-plan.md §7.3): la misma regla de quién
 * la puede leer que `getReunionesParaTareas`, y la transcripción comprimida y numerada por turno, hasta
 * `MAX_TRANSCRIPT_CHARS`. null si la persona no la puede leer o si no hay conversación.
 */
export async function conversacionParaTareas(quien: QuienLeeReuniones, sessionId: string): Promise<{ reunion: ReunionParaTareas; conversacion: ConversacionComprimida } | null> {
  const f = await prisma.firefliesSession.findFirst({ where: { id: sessionId, date: { lte: new Date() } }, select: SELECT });
  if (!f?.transcript) return null;
  const reunion = await aReunion(f, quien, await dominiosDeLaCasa());
  if (!reunion) return null;
  const conversacion = comprimirConversacion(f.transcript, MAX_TRANSCRIPT_CHARS);
  return conversacion.turnos.length ? { reunion, conversacion } : null;
}
