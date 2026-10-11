/**
 * lib/sessions/reuniones-para-seguimiento.ts — las reuniones que lee «Lo que dejó esta reunión». Lector del
 * CHOKEPOINT. SERVIDOR.
 *
 * La tarjeta de una reunión (lib/seguimiento) no lee `FirefliesSession` ni `SessionProject` por su cuenta
 * (invariante #1): pasa por acá, con la misma regla de dueño que el resto de Nexus.
 *
 *   · El dueño es `resolvedClientId` (el manual, solo si no hay): `duenoDeLaSesion`. Sin dueño no hay tarjeta.
 *   · Solo de un CLIENTE o un PROSPECTO: una reunión de un aliado o de Smarteam no deja nada que revisar acá.
 *   · Una reunión de puertas adentro (todos los que estuvieron son de la casa) nunca tiene tarjeta: la lee Tareas.
 *   · Los proyectos son los vinculados con `included: true` que son del MISMO cliente (`belongsToClient`).
 *
 * Desde acá nunca se escribe nada.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getSessionCategories } from "@/lib/cache/session-categories";
import { proyectoClasificableWhere } from "@/lib/projects/scope";
import { buildInternalDomainsSet } from "./categorize";
import { esReunionDePuertasAdentro } from "./candidatas-internas";
import { duenoDeLaSesion } from "./project-sources";

export interface ReunionDeLaTarjeta {
  id: string;
  titulo: string;
  /** ISO. */
  fecha: string;
  /** El dueño (`resolvedClientId`, o el manual si no hay). */
  clientId: string;
  empresa: { kind: string; nombre: string };
  proyectos: { id: string; name: string }[];
}

export interface ReunionReciente {
  sessionId: string;
  projectId: string;
  clientId: string;
  titulo: string;
  /** ISO. */
  fecha: string;
}

/** Los tipos de empresa cuyas reuniones dejan algo que revisar en la tarjeta. */
const EMPRESAS_CON_TARJETA = new Set(["CLIENTE", "PROSPECTO"]);

/** Los dominios que cuentan como de la casa (las categorías internas). Lo usan la tarjeta, «Para ti» y la lectura de seguimiento. */
export async function dominiosDeLaCasa(): Promise<Set<string>> {
  // Fuera de un pedido de Next (un script) no hay caché incremental: la misma consulta, directa.
  const categorias = await getSessionCategories().catch(() =>
    prisma.sessionCategory.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true, slug: true, domains: true, kind: true, color: true } }),
  );
  return buildInternalDomainsSet(categorias);
}

/**
 * ¿Es una reunión de puertas adentro (todos los que estuvieron son de la casa)? La MISMA regla que la tarjeta y «Para
 * ti»: la lectura de seguimiento no lee estas reuniones aunque su dueño sea un cliente (lo dicho sin el cliente no se le
 * atribuye al cliente). Una sala sin nadie no es de puertas adentro: es un dato incompleto.
 */
export async function esDePuertasAdentro(s: { participants: readonly string[]; organizerEmail?: string | null }, dominios?: ReadonlySet<string>): Promise<boolean> {
  return esReunionDePuertasAdentro({ participants: [...s.participants], organizerEmail: s.organizerEmail ?? null }, dominios ?? (await dominiosDeLaCasa()));
}

/**
 * El dueño de una reunión (`resolvedClientId`, el manual solo si no hay), o null. Para las rutas que tienen que pedir
 * acceso al cliente de la reunión antes de tocar algo suyo (la minuta), aunque la reunión no tenga tarjeta.
 */
export async function duenoDeLaReunion(sessionId: string): Promise<string | null> {
  const s = await prisma.firefliesSession.findUnique({ where: { id: sessionId }, select: { resolvedClientId: true, manualClientId: true } });
  return s ? duenoDeLaSesion(s) : null;
}

/** El dueño de varias reuniones en UNA consulta (el reintento de los hechos mira cientos por tick). Las que no existen no vienen. */
export async function duenosDeLasReuniones(sessionIds: readonly string[]): Promise<Map<string, string | null>> {
  if (!sessionIds.length) return new Map();
  const filas = await prisma.firefliesSession.findMany({
    where: { id: { in: [...sessionIds] } },
    select: { id: true, resolvedClientId: true, manualClientId: true },
  });
  return new Map(filas.map((s) => [s.id, duenoDeLaSesion(s)]));
}

/**
 * La reunión de la tarjeta, o null si no tiene una: no existe, todavía no ocurrió, no tiene dueño, el dueño no es un
 * cliente ni un prospecto, o es de puertas adentro.
 */
export async function reunionParaLaTarjeta(sessionId: string): Promise<ReunionDeLaTarjeta | null> {
  const s = await prisma.firefliesSession.findFirst({
    where: { id: sessionId, date: { lte: new Date() } },
    select: { id: true, title: true, date: true, participants: true, organizerEmail: true, resolvedClientId: true, manualClientId: true },
  });
  if (!s) return null;
  const clientId = duenoDeLaSesion(s);
  if (!clientId) return null;
  const [cliente, dominios] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: { kind: true, name: true } }),
    dominiosDeLaCasa(),
  ]);
  if (!cliente || !EMPRESAS_CON_TARJETA.has(cliente.kind)) return null;
  if (esReunionDePuertasAdentro({ participants: s.participants, organizerEmail: s.organizerEmail }, dominios)) return null;
  const links = await prisma.sessionProject.findMany({
    where: { sessionId, included: true, project: proyectoClasificableWhere({ clientId }) },
    orderBy: [{ isPrimary: "desc" }, { confidence: "desc" }],
    select: { project: { select: { id: true, name: true } } },
  });
  return {
    id: s.id,
    titulo: s.title,
    fecha: s.date.toISOString(),
    clientId,
    empresa: { kind: cliente.kind, nombre: cliente.name },
    proyectos: links.map((l) => ({ id: l.project.id, name: l.project.name })),
  };
}

/**
 * Las reuniones de estos proyectos entre `desde` y ahora, para «Para ti»: las vinculadas con `included: true` cuyo
 * DUEÑO es el cliente del proyecto y no son de puertas adentro. Mismo molde que `contarSesionesSinRevisar`, pero con el
 * dueño de la tarjeta (`duenoDeLaSesion`) en vez de `belongsToClient`: el enlace lleva a la tarjeta, y la tarjeta es
 * del dueño.
 * Una reunión vinculada a dos proyectos sale una vez por proyecto: quien cuenta decide.
 */
export async function reunionesRecientesDeProyectos(
  proyectos: readonly { id: string; clientId: string }[],
  desde: Date,
): Promise<ReunionReciente[]> {
  if (proyectos.length === 0) return [];
  const clienteDe = new Map(proyectos.map((p) => [p.id, p.clientId]));
  const [links, dominios] = await Promise.all([
    prisma.sessionProject.findMany({
      where: { projectId: { in: [...clienteDe.keys()] }, included: true, session: { date: { gte: desde, lte: new Date() } } },
      select: {
        projectId: true,
        session: {
          select: { id: true, title: true, date: true, participants: true, organizerEmail: true, resolvedClientId: true, manualClientId: true },
        },
      },
    }),
    dominiosDeLaCasa(),
  ]);
  const out: ReunionReciente[] = [];
  for (const l of links) {
    const clientId = clienteDe.get(l.projectId);
    if (!clientId || duenoDeLaSesion(l.session) !== clientId) continue;
    if (esReunionDePuertasAdentro({ participants: l.session.participants, organizerEmail: l.session.organizerEmail }, dominios)) continue;
    out.push({ sessionId: l.session.id, projectId: l.projectId, clientId, titulo: l.session.title, fecha: l.session.date.toISOString() });
  }
  return out;
}
