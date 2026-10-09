/**
 * lib/sessions/agregar-sesion.ts — LA PUERTA DE «AGREGAR UNA REUNIÓN A UN PROYECTO». UNA SOLA.
 *
 * ── POR QUÉ SALIÓ DE LA RUTA ─────────────────────────────────────────────────
 * Vivía adentro de `handoff-sessions/route.ts`. El 2026-09-23 nació una segunda puerta —el
 * «Contexto del cronograma» (`timeline/sessions`)— que tiene que hacer EXACTAMENTE lo mismo antes
 * de escribir su propio afinado: rechazar el vínculo nuevo a una reunión de otro cliente (INV1),
 * adoptar la huérfana solo cuando no hay nada que decidir, y releer después de adoptar por si otra
 * persona la asignó en paralelo. Copiar esas ~70 líneas eran dos reglas de adopción que se separan
 * el día que alguien arregle una sola.
 *
 * ── QUÉ HACE Y QUÉ NO ────────────────────────────────────────────────────────
 * Decide y, si corresponde, ADOPTA. NO escribe el vínculo: cada puerta hace su propio `upsert`
 * porque cada una escribe SOLO su afinado (`handoffOverride` o `timelineOverride`). La decisión
 * pura vive en `candidatas-internas.ts` (`decidirAlAgregar`, `motivoParaNoAdoptar`), con tests.
 */
import { prisma } from "@/lib/db/prisma";
import { adoptarSesionSinDuenio, belongsToClient } from "./project-sources";
import { decidirAlAgregar, motivoParaNoAdoptar } from "./candidatas-internas";
import { buildInternalDomainsSet } from "./categorize";

export type ResultadoDeAgregar = { ok: true } | { ok: false; status: number; error: string };

interface PedidoDeVinculo {
  sessionId: string;
  projectId: string;
  /** El cliente del proyecto (lo resuelve el guard de la ruta). */
  clientId: string;
  /** `true` = incluir / agregar; `false` = la X. */
  quiereIncluir: boolean;
  actorEmail: string | null;
}

/** Lo que se decidió SIN escribir nada: rechazar, o seguir (adoptándola antes, si es huérfana). */
type Decidido = { ok: false; status: number; error: string } | { ok: true; adoptar: boolean };

/**
 * Decide si se puede vincular, SIN escribir. Separada de la adopción el 2026-10-09 para la versión en
 * lote (`prepararVinculosManuales`): con varias reuniones, primero se deciden TODAS y recién si todas
 * pasan se adopta lo que haga falta — una que no pasa las validaciones no deja adoptada a ninguna.
 * ⚠ Lo que queda afuera es la carrera de la relectura: si otra persona asigna una huérfana entre la
 * decisión y su adopción, las que ya se adoptaron quedan del cliente (sin vínculo). Es la misma ventana
 * que tenía la puerta de una reunión, y desde la pantalla no se arma: el lote con `feeds: true` sale de
 * deshacer o de «Volver a incluir», con reuniones que ya eran del cliente.
 */
async function decidirVinculoManual(i: PedidoDeVinculo): Promise<Decidido> {
  const [existing, session] = await Promise.all([
    prisma.sessionProject.findUnique({
      where: { sessionId_projectId: { sessionId: i.sessionId, projectId: i.projectId } },
      select: { id: true },
    }),
    prisma.firefliesSession.findUnique({
      where: { id: i.sessionId },
      select: {
        resolvedClientId: true,
        manualClientId: true,
        participants: true,
        organizerEmail: true,
        projects: { select: { project: { select: { clientId: true } } } },
      },
    }),
  ]);
  if (!session) return { ok: false, status: 404, error: "Sesión no existe" };

  /* Sin dueño: vincular no alcanza. `getProjectMemberSessions` descarta al LEER lo que no
     pertenece al cliente, así que el link quedaría escrito, el botón parecería haber funcionado y
     el documento seguiría sin esa reunión. Adoptarla la vuelve del cliente de verdad — pero solo
     lo que `motivoParaNoAdoptar` deja (solo estuvo el equipo, no cuelga de otro cliente). */
  const sinDuenio = session.resolvedClientId === null && session.manualClientId === null;
  let motivoNoAdoptable: string | null = null;
  if (i.quiereIncluir && sinDuenio) {
    const categorias = await prisma.sessionCategory.findMany({ select: { domains: true, kind: true } });
    motivoNoAdoptable = motivoParaNoAdoptar(
      {
        participants: session.participants,
        organizerEmail: session.organizerEmail,
        clientesDeSusProyectos: session.projects.map((p) => p.project.clientId),
      },
      i.clientId,
      buildInternalDomainsSet(categorias),
    );
  }

  const decision = decidirAlAgregar({
    vinculoExiste: existing !== null,
    quiereIncluir: i.quiereIncluir,
    sinDuenio,
    perteneceAlCliente: belongsToClient(session, i.clientId),
    motivoNoAdoptable,
  });
  if (decision.tipo === "rechazar") return { ok: false, status: decision.status, error: decision.error };
  return { ok: true, adoptar: decision.tipo === "adoptar" };
}

/** Adopta la huérfana y RELEE: si otra persona la asignó a otro cliente entretanto, no se vincula. */
async function adoptarYReleer(i: PedidoDeVinculo): Promise<ResultadoDeAgregar> {
  await adoptarSesionSinDuenio(i.sessionId, i.clientId, i.actorEmail);
  /* Carrera: entre la lectura de arriba y la adopción, otra persona pudo asignarla a otro
     cliente (la adopción no pisa: solo escribe si sigue sin dueño). Se relee y, si no quedó de
     este cliente, no se vincula — el vínculo quedaría cruzado. */
  const ahora = await prisma.firefliesSession.findUnique({
    where: { id: i.sessionId },
    select: { resolvedClientId: true, manualClientId: true },
  });
  if (!ahora || !belongsToClient(ahora, i.clientId)) {
    return {
      ok: false,
      status: 409,
      error: "Otra persona acaba de asignar esta reunión a otro cliente: revísala en Sesiones.",
    };
  }
  return { ok: true };
}

export async function prepararVinculoManual(i: PedidoDeVinculo): Promise<ResultadoDeAgregar> {
  const d = await decidirVinculoManual(i);
  if (!d.ok) return d;
  return d.adoptar ? adoptarYReleer(i) : { ok: true };
}

/** Tope de reuniones por pedido: más que cualquier columna, sin abrir la puerta a cualquier cosa. */
export const MAX_VINCULOS_DE_UNA_VEZ = 200;

/**
 * La MISMA puerta para varias reuniones de una vez (2026-10-09, la lista de reuniones de «Contexto
 * adicional»: «Quitar las N», «Vaciar y buscar», deshacer). Mismas validaciones por reunión que
 * `prepararVinculoManual`, en dos pasadas:
 *   1. decide TODAS sin escribir; la primera que no pasa corta todo y el error dice cuál («Título»: …);
 *   2. solo si pasaron todas, adopta las huérfanas que hagan falta.
 * El vínculo lo escribe la ruta después, en UNA transacción. Una sola reunión es una lista de una.
 */
export async function prepararVinculosManuales(
  i: Omit<PedidoDeVinculo, "sessionId"> & { sessionIds: string[] },
): Promise<ResultadoDeAgregar> {
  const conTitulo = async (sessionId: string, error: string) => {
    if (i.sessionIds.length === 1) return error;
    const s = await prisma.firefliesSession.findUnique({ where: { id: sessionId }, select: { title: true } });
    return `«${(s?.title ?? "").trim() || sessionId}»: ${error}`;
  };
  const porAdoptar: string[] = [];
  for (const sessionId of i.sessionIds) {
    const d = await decidirVinculoManual({ ...i, sessionId });
    if (!d.ok) return { ok: false, status: d.status, error: await conTitulo(sessionId, d.error) };
    if (d.adoptar) porAdoptar.push(sessionId);
  }
  for (const sessionId of porAdoptar) {
    const r = await adoptarYReleer({ ...i, sessionId });
    if (!r.ok) return { ok: false, status: r.status, error: await conTitulo(sessionId, r.error) };
  }
  return { ok: true };
}

/**
 * `sugeridas` (opcional, solo con `feeds: true`): las de `ids` que deshacer devuelve a «sugerida» —el
 * afinado vacío, como estaban antes de la X— en vez de «agregada a mano». Sin esto, sacar una sugerida
 * del handoff o de un documento y deshacerlo la dejaba forzada: con candado, y el clasificador ya no
 * la movía. Las puertas que no tienen «sugerida» (el cronograma) lo ignoran.
 *
 * El cuerpo de las tres puertas de un proyecto (handoff, cronograma y documentos): `{ sessionId,
 * feeds }` (una reunión) o `{ sessionIds, feeds }` (varias). Devuelve las reuniones sin repetir.
 */
export function leerCuerpoDeVinculos(
  body: unknown,
): { ok: true; ids: string[]; feeds: boolean; sugeridas: Set<string> } | { ok: false; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as {
    sessionId?: unknown;
    sessionIds?: unknown;
    feeds?: unknown;
    sugeridas?: unknown;
  };
  if (typeof b.feeds !== "boolean") return { ok: false, error: "sessionId y feeds (boolean) requeridos" };
  const crudos = Array.isArray(b.sessionIds) ? b.sessionIds : [b.sessionId];
  const ids = [...new Set(crudos.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean))];
  if (ids.length === 0) return { ok: false, error: "sessionId y feeds (boolean) requeridos" };
  if (ids.length > MAX_VINCULOS_DE_UNA_VEZ) return { ok: false, error: `Son demasiadas reuniones de una vez (máximo ${MAX_VINCULOS_DE_UNA_VEZ}).` };
  // Solo las del mismo pedido, y solo al devolver: quitar nunca deja una reunión «sugerida».
  const sugeridas = new Set(
    b.feeds && Array.isArray(b.sugeridas)
      ? b.sugeridas.filter((x): x is string => typeof x === "string").filter((x) => ids.includes(x))
      : [],
  );
  return { ok: true, ids, feeds: b.feeds, sugeridas };
}

/**
 * La misma regla para la PREVENTA (2026-10-07), que no tiene proyecto ni vínculo: sumar una reunión
 * elegida en el buscador de «Contexto adicional». Una del cliente se suma; una sin dueño se ADOPTA
 * (solo lo que `motivoParaNoAdoptar` deja); una de otro cliente se rechaza (INV1). Sin transcripción
 * no se suma: la preventa no tendría qué leer. Igual que arriba, relee después de adoptar.
 */
export async function prepararReunionParaElCliente(i: {
  sessionId: string;
  clientId: string;
  actorEmail: string | null;
}): Promise<ResultadoDeAgregar> {
  const session = await prisma.firefliesSession.findUnique({
    where: { id: i.sessionId },
    select: {
      date: true,
      resolvedClientId: true,
      manualClientId: true,
      participants: true,
      organizerEmail: true,
      transcript: true,
      projects: { select: { project: { select: { clientId: true } } } },
    },
  });
  if (!session) return { ok: false, status: 404, error: "Esa reunión no existe." };
  if (session.date.getTime() > Date.now()) return { ok: false, status: 400, error: "Esa reunión todavía no ocurre: no hay nada que leer." };
  if (!(session.transcript ?? "").trim()) {
    return { ok: false, status: 400, error: "Esa reunión no tiene transcripción: el agente no tendría qué leer." };
  }
  if (belongsToClient(session, i.clientId)) return { ok: true };
  const sinDuenio = session.resolvedClientId === null && session.manualClientId === null;
  if (!sinDuenio) {
    return { ok: false, status: 400, error: "Esa reunión es de otro cliente: no puede alimentar esta preventa. Si está mal asignada, corrígela en Sesiones." };
  }
  const categorias = await prisma.sessionCategory.findMany({ select: { domains: true, kind: true } });
  const motivo = motivoParaNoAdoptar(
    {
      participants: session.participants,
      organizerEmail: session.organizerEmail,
      clientesDeSusProyectos: session.projects.map((p) => p.project.clientId),
    },
    i.clientId,
    buildInternalDomainsSet(categorias),
  );
  if (motivo) return { ok: false, status: 400, error: motivo };
  await adoptarSesionSinDuenio(i.sessionId, i.clientId, i.actorEmail);
  const ahora = await prisma.firefliesSession.findUnique({ where: { id: i.sessionId }, select: { resolvedClientId: true, manualClientId: true } });
  if (!ahora || !belongsToClient(ahora, i.clientId)) {
    return { ok: false, status: 409, error: "Otra persona acaba de asignar esta reunión a otro cliente: revísala en Sesiones." };
  }
  return { ok: true };
}
