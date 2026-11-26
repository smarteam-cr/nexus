/**
 * lib/sessions/resolve-client.ts
 *
 * Materialización del match sesión→cliente (PERF #1). En vez de cargar las ~16k
 * `FirefliesSession` a memoria y matchear en cada navegación, persistimos el
 * resultado de `categorizeSession` en `FirefliesSession.resolvedClientId` y leemos
 * con queries agregadas indexadas.
 *
 * Única fuente de verdad de "de quién es la sesión": `categorizeSession` (la MISMA
 * cascada que /sessions). Acá se materializa CON la señal de HubSpot poblada (batch
 * `searchCompaniesByDomains` sobre los dominios externos) + el map company→Client, así
 * el paso 5 resuelve dominio→empresa-HubSpot→Client (señal fuerte) y NO cae al título.
 * Si HubSpot falla, degrada a mapa vacío (comportamiento previo).
 *
 * Disparadores que lo mantienen fresco (ver plan, Decisión 5):
 *   - meet-sync (create/update): resuelve inline con el ctx de la corrida.
 *   - endpoint de override manualClientId: `reResolveSession(id)`.
 *   - mutaciones de Client (crear / editar emailDomains/company): `resolveAllSessions()` en background.
 *   - backfill one-time: `resolveAllSessions({ dryRun })`.
 */

import { prisma } from "@/lib/db/prisma";
import {
  categorizeSession,
  buildInternalDomainsSet,
  collectExternalDomains,
  computeAmbiguousNameTokens,
  entidadesDelDominio,
  aprenderPersonasDeEntidades,
  pistasDeTitulo,
  interlocutoresDesdeFilas,
  fichasQueDaElDominio,
  type CategorizeContext,
  type TrazaDeLaCascada,
  type CategorizableSession,
  ORDEN_DE_CLIENTES_PARA_ATRIBUIR,
} from "@/lib/sessions/categorize";
export { ORDEN_DE_CLIENTES_PARA_ATRIBUIR };
import { searchCompaniesByDomains, type HubspotCompanyLite } from "@/lib/hubspot/companies";
import { esDominioGenerico } from "@/lib/clients/personas-de-la-empresa";
import { DIAS_DE_FRESCURA } from "@/lib/lecturas/reglas";
import { NO_ES_CONTENEDOR_WHERE } from "@/lib/projects/scope";


/**
 * Un cambio en memoria de las fichas (una sigla que se suma, un dominio que pasa), para un simulacro. Devuelve las MISMAS
 * filas, con esos campos cambiados: lo demás de cada ficha no lo toca.
 */
export type AjustarFichas = <T extends { id: string; siglas?: string[] | null; emailDomains: string[] }>(clients: readonly T[]) => T[];

/**
 * Carga el contexto de categorización (clientes + categorías) una sola vez. `ajustarFichas` (solo para un simulacro)
 * cambia en memoria las fichas ANTES de armar lo que se deriva de ellas (las empresas de HubSpot ligadas, las palabras
 * ambiguas, la gente aprendida de los títulos): así el simulacro da lo mismo que la base con el cambio escrito (revisión
 * del 26 nov: con la sigla «SAS» sumada después, lo aprendido de los títulos «SAS …» quedaba afuera).
 */
export async function buildCategorizeCtx(ajustarFichas?: AjustarFichas): Promise<CategorizeContext> {
  const [leidas, categories] = await Promise.all([
    prisma.client.findMany({
      orderBy: ORDEN_DE_CLIENTES_PARA_ATRIBUIR,
      select: {
        id: true,
        name: true,
        company: true,
        emailDomains: true,
        hubspotCompanyId: true,
        siglas: true,
        comparteDominioConId: true,
      },
    }),
    prisma.sessionCategory.findMany({
      select: { id: true, name: true, slug: true, domains: true, kind: true, color: true },
    }),
  ]);
  const clients = ajustarFichas ? ajustarFichas(leidas) : leidas;
  // Señal fuerte del paso 5: company de HubSpot ligada → Client de Nexus.
  const clientsByHubspotCompanyId = new Map<string, { id: string; name: string; company: string | null }>();
  for (const c of clients) {
    if (c.hubspotCompanyId) {
      clientsByHubspotCompanyId.set(c.hubspotCompanyId, { id: c.id, name: c.name, company: c.company });
    }
  }
  const ctx: CategorizeContext = {
    clients,
    categories,
    // Se puebla por sesión/batch en reResolveSession/resolveAllSessions (degrada a vacío si falla HubSpot).
    hubspotCompaniesByDomain: new Map(),
    internalDomains: buildInternalDomainsSet(categories),
    clientsByHubspotCompanyId,
    ambiguousNameTokens: computeAmbiguousNameTokens(clients),
  };
  ctx.personasDeEntidades = await cargarPersonasDeEntidades(ctx);
  ctx.interlocutoresConfirmados = await cargarInterlocutoresConfirmados();
  ctx.fichasConProyecto = await cargarFichasConProyecto();
  return ctx;
}

/**
 * Las fichas con algún proyecto que no es el contenedor «Información del cliente» ni de prueba, en CUALQUIER estado
 * (categorize.ts › la regla del grupo, Elías 26 nov). En cualquier estado a propósito: que un proyecto se cierre no le
 * cambia la dueña a sus reuniones viejas. La comparten /sessions y la materialización, como la gente confirmada (INV2).
 */
export async function cargarFichasConProyecto(db: Pick<typeof prisma, "project"> = prisma): Promise<Set<string>> {
  const filas = await db.project.groupBy({ by: ["clientId"], where: { esPrueba: false, ...NO_ES_CONTENEDOR_WHERE } });
  return new Set(filas.map((f) => f.clientId));
}

/**
 * La gente que una persona del equipo confirmó, correo → las fichas con las que trabaja (categorize.ts › paso 3·0,
 * «Unidades e interlocutores», 2026-11-25). Las fichas van en el orden de atribuir para que el resultado no dependa de
 * cómo devuelva las filas la base. Con la base atrasada (sin el SQL 2026-11-25-interlocutores-confirmados) devuelve
 * vacío: la cascada sigue como antes en vez de tirar la sincronización de Meet. La comparten /sessions y la
 * materialización: las dos tienen que ver lo mismo (INV2).
 */
export async function cargarInterlocutoresConfirmados(db: Pick<typeof prisma, "personaDeLaEmpresa"> = prisma): Promise<Map<string, string[]>> {
  try {
    const filas = await db.personaDeLaEmpresa.findMany({
      where: { confirmadaAt: { not: null } },
      select: { correo: true, clientId: true, client: { select: { createdAt: true } } },
    });
    return interlocutoresDesdeFilas(filas.map((f) => ({ correo: f.correo, clientId: f.clientId, desde: f.client.createdAt })));
  } catch (e) {
    const { esquemaDesactualizado } = await import("@/lib/db/esquema");
    if (esquemaDesactualizado(e)) return new Map();
    throw e;
  }
}


/**
 * La gente de cada entidad que comparte dominio (categorize.ts › `aprenderPersonasDeEntidades`). Se cargan las reuniones
 * que pueden enseñar: las que traen una pista en el título. A propósito NO mira `resolvedClientId`: si dependiera de lo
 * materializado, una corrida cambiaría lo aprendido y la siguiente daría otro resultado (INV2 en rojo). Sin grupos no
 * consulta nada.
 */
async function cargarPersonasDeEntidades(ctx: CategorizeContext): Promise<Map<string, string>> {
  const delGrupo = ctx.clients.filter((c) => entidadesDelDominio(c.id, ctx));
  if (delGrupo.length === 0) return new Map();
  const sesiones = await prisma.firefliesSession.findMany({
    where: { OR: pistasDeTitulo(delGrupo, ctx.ambiguousNameTokens).map((p) => ({ title: { contains: p, mode: "insensitive" as const } })) },
    select: { title: true, participants: true, manualClientId: true },
  });
  return aprenderPersonasDeEntidades(sesiones, ctx);
}

/**
 * Pobla el map dominio→company de HubSpot para un conjunto de sesiones (1 batch).
 * Usa la versión NO cacheada (corre también desde scripts `tsx`, fuera del runtime
 * Next donde `unstable_cache` no aplica). Si HubSpot falla, devuelve vacío (degrada).
 */
export async function buildHubspotDomainMap(
  sessions: { participants: string[] }[],
  internalDomains: Set<string>,
): Promise<Map<string, HubspotCompanyLite>> {
  try {
    const domains = collectExternalDomains(sessions, internalDomains);
    if (domains.length === 0) return new Map();
    return await searchCompaniesByDomains(domains);
  } catch (e) {
    console.warn(
      "[resolve-client] lookup de HubSpot falló — degradando sin la señal HubSpot→Client:",
      e instanceof Error ? e.message : e,
    );
    return new Map();
  }
}

/** Resuelve el clientId de UNA sesión (null si no matchea un cliente). */
export function resolveSessionClientId(
  session: CategorizableSession,
  ctx: CategorizeContext,
): string | null {
  const group = categorizeSession(session, ctx);
  return group.kind === "client" ? group.id : null;
}

/**
 * Re-resuelve y persiste `resolvedClientId` de una sesión por id. Para hooks
 * puntuales (override de manualClientId). Construye el ctx si no se pasa.
 */
export async function reResolveSession(
  sessionId: string,
  ctx?: CategorizeContext,
  opts?: {
    /**
     * ¿Correr el clasificador de IA sobre el cliente que ganó la sesión? Default `true` —
     * el comportamiento de siempre.
     *
     * Se apaga cuando el humano ACABA de elegir el proyecto a mano: pagar el modelo para que
     * adivine lo mismo que alguien recién dijo es tirar plata (del orden de un dólar por
     * corrida, hasta 30 sesiones), y encima puede proponer links a otros proyectos del cliente
     * que nadie pidió.
     */
    reclassify?: boolean;
    /**
     * Si queda en una ficha, borrar en la MISMA transacción sus vínculos a proyectos de otra ficha (invariante 1, como
     * «Mover»). Lo pide la mudanza de `reResolverReunionesDe` (revisión del 26 nov): en dos pasos, un corte entre los dos
     * dejaba la reunión en la ficha nueva con vínculos cruzados que ninguna corrida siguiente vuelve a mirar.
     */
    soltarVinculosAjenos?: boolean;
    /**
     * Esperar lo que el cambio de dueña dispara (la lectura, los hechos, el análisis de venta) en vez de soltarlo en
     * segundo plano. Lo pide un script, que cierra la conexión al terminar y cortaba esas tareas a medias sin que nadie lo
     * viera (revisión del 26 nov). Cada una sigue sin lanzar.
     */
    esperar?: boolean;
  },
): Promise<void> {
  const session = await prisma.firefliesSession.findUnique({
    where: { id: sessionId },
    select: { id: true, title: true, participants: true, manualClientId: true, resolvedClientId: true },
  });
  if (!session) return;
  let c = ctx;
  if (!c) {
    c = await buildCategorizeCtx();
    c.hubspotCompaniesByDomain = await buildHubspotDomainMap([session], c.internalDomains);
  }
  const resolved = resolveSessionClientId(session, c);
  if (opts?.soltarVinculosAjenos && resolved) {
    await prisma.$transaction([
      prisma.firefliesSession.update({ where: { id: sessionId }, data: { resolvedClientId: resolved } }),
      prisma.sessionProject.deleteMany({ where: { sessionId, project: { clientId: { not: resolved } } } }),
    ]);
  } else {
    await prisma.firefliesSession.update({
      where: { id: sessionId },
      data: { resolvedClientId: resolved },
    });
  }
  // Si cambió de dueño, re-clasificar el cliente nuevo para vincular esta sesión a sus
  // proyectos (cierra el hueco resolver≠clasificar). Fire-and-forget.
  const enCurso: Promise<unknown>[] = [];
  if (resolved && resolved !== session.resolvedClientId && opts?.reclassify !== false) {
    enCurso.push(
      import("./reclassify")
        .then((m) => m.reclassifyClientSessions(resolved))
        .catch(() => {}),
    );
  }
  // La lectura de seguimiento (memoria de la cuenta, etapa 2): una reunión que recibe dueño a mano también tiene que
  // tener su lectura. La cola decide si corresponde (de un cliente o un prospecto, no de puertas adentro, fresca, con
  // transcripción) y nunca lanza; con la bandera apagada no se encola nada.
  // ⚠ Solo entra una reunión que todavía NO se leyó (o quedó sin texto, en error u omitida): una lista no se vuelve a
  // leer, y lo que dejó para el dueño anterior (propuestas de Tarea, pedidos fuera de alcance) queda con ese cliente
  // hasta que alguien lo corrija a mano; INV42 (tareas) e INV46 (pedidos) lo muestran (DECISIONS «La lectura de cada
  // reunión es durable…»).
  if (resolved && resolved !== session.resolvedClientId) {
    enCurso.push(
      import("@/lib/lecturas/reglas")
        .then(async (r) => (r.seguimientoPrendido(process.env) ? (await import("@/lib/lecturas/cola")).encolarSeguimiento(sessionId) : null))
        .catch(() => {}),
    );
  }
  // Los HECHOS de la reunión (memoria de la cuenta, etapa 6): los pendientes que eran del dueño anterior quedan
  // desestimados («La reunión cambió de dueño»), y el job de la lectura vuelve a pedir los hechos en el cliente nuevo
  // (solo los hechos: la minuta no se relee y lo decidido no se toca). Sin la tabla no hace nada; nunca lanza.
  if (resolved !== session.resolvedClientId) {
    const duenoNuevo = resolved ?? session.manualClientId ?? null;
    enCurso.push(
      import("@/lib/seguimiento/hechos-server")
        .then((m) => m.alCambiarDeDueno([{ sessionId, duenoNuevo }]))
        .catch(() => {}),
    );
    // El análisis de venta de la dueña anterior ya no vale (S3, invariante 1; INV57). Nunca lanza.
    enCurso.push(import("@/lib/analizador-venta/ajenos").then((m) => m.soltarAnalisisDeVentaAjenos([sessionId])).catch(() => {}));
  }
  if (opts?.esperar) await Promise.all(enCurso);
}

/** Una reunión que cambia de dueña por un cambio en la gente confirmada. `de`/`a` null = por decidir. */
export interface ReunionQueCambia {
  sessionId: string;
  title: string;
  date: Date;
  /** La dueña que tiene hoy (materializada). */
  de: string | null;
  /** La que tendría con el cambio. */
  a: string | null;
  /** Por qué la tendría: el paso de la cascada que decidió (y cómo, si decidió entre fichas). */
  porQue?: TrazaDeLaCascada;
}

/**
 * Tope de reuniones POR PERSONA que se miran al confirmar a alguien. Si una persona lo alcanza, no se corta en silencio:
 * se lanza (las que quedaran afuera las movería después, sin simulacro, la próxima corrida general). La que más tiene hoy
 * anda por las 170.
 */
const MAX_REUNIONES_POR_CONFIRMACION = 1000;

/**
 * «Unidades e interlocutores» (2026-11-25): las reuniones de estas personas que cambian de dueña si su confirmación queda
 * como dice `hipotesis` (correo → fichas; sin él, como está hoy en la base). Sin `aplicar` no escribe nada: es el
 * simulacro que se muestra antes de guardar. Con `aplicar`, las re-resuelve (`reResolveSession`, con lo que cuelga de un
 * cambio de dueña: los hechos, el análisis de venta, la lectura) y, como «Mover» una reunión
 * (empresa-de-la-reunion-server.ts), suelta sus vínculos a proyectos de otra ficha cuando la dueña nueva es una ficha
 * (invariante 1; si queda por decidir, los vínculos esperan a la persona que la asigne). La reclasificación con IA corre
 * UNA vez por ficha que ganó reuniones, con el mismo tope que `resolveAllSessions` (revisión del 25 nov: una por reunión
 * eran N corridas de la misma ficha a la vez). Lo asignado a mano no se mueve (paso 1).
 * ⚠ La decisión es la de la cascada (categorize.ts); acá solo se materializa.
 */
export async function reResolverReunionesDe(
  correos: readonly string[],
  o: {
    hipotesis?: ReadonlyMap<string, readonly string[]>;
    aplicar: boolean;
    /**
     * Con `aplicar`: las reuniones que una persona VIO en el simulacro, de qué ficha a cuál (sessionId → { de, a }; null =
     * sin dueña / por decidir). Solo se mueven esas, y solo si la cuenta de ahora da lo mismo; las demás se devuelven en
     * `saltadas` (revisión del 25 nov: entre el aviso y el guardado pudo cambiar algo, o HubSpot no responder, y se movían
     * reuniones que nadie vio, quizá de una ficha que quien guardaba no abre). Sin él, se mueve todo lo que cambie.
     */
    aprobadas?: ReadonlyMap<string, { de: string | null; a: string | null }>;
    /**
     * Solo para un simulacro: cambia en memoria las fichas del contexto (una sigla, un dominio) antes de resolver, y antes
     * de armar lo que se deriva de ellas (`buildCategorizeCtx`).
     */
    ajustarFichas?: AjustarFichas;
    /**
     * Las empresas de HubSpot por dominio que ya trajo un simulacro (lo devuelve en `hubspot`). Con él no se le pregunta a
     * HubSpot otra vez: el --apply de la precarga lo pasa para no depender de HubSpot DESPUÉS de escribir las fichas y las
     * personas (revisión del 26 nov: si no respondía ahí, quedaba escrito a medias).
     */
    hubspot?: ReadonlyMap<string, HubspotCompanyLite>;
    /** Con `aplicar`: esperar lo que cuelga de cada mudanza y la reclasificación (`reResolveSession` › `esperar`). */
    esperarLoQueCuelga?: boolean;
    /**
     * Si HubSpot no responde, lanzar (`HubspotNoRespondio`) en vez de contar sin el paso 5. Lo pide la pestaña de
     * interlocutores (revisión del 25 nov): con HubSpot caído, el aviso mostraba reuniones que «se movían» solo porque
     * faltaba ese dato, y el guardado las aplicaba. Sin cuenta de HubSpot conectada, se sigue sin él (el resolver tampoco
     * puede usarlo).
     */
    exigirHubspot?: boolean;
    /**
     * Mirar TODAS las reuniones, no solo las de estas personas: lo pide un cambio de las fichas (una sigla, un dominio),
     * que mueve también reuniones de otra gente. Sin el tope por persona.
     */
    todas?: boolean;
    /**
     * Mirar también las reuniones que nombran a estas fichas en el título y las de la gente confirmada en ellas (antes o
     * con la hipótesis). Lo pide un cambio que arma o desarma un GRUPO (alguien confirmado en dos fichas): la regla del
     * grupo (categorize.ts › `duenaDelProyectoDelGrupo`) cambia la dueña de reuniones de OTRA gente, como «Kick off -
     * Teamnet y Sas», que es interna (Elías, 26 nov).
     */
    tambienLasDeLasFichas?: readonly string[];
  },
): Promise<{ cambian: ReunionQueCambia[]; saltadas: ReunionQueCambia[]; hubspot: ReadonlyMap<string, HubspotCompanyLite> }> {
  const lista = [...new Set(correos.map((c) => c.trim().toLowerCase()).filter(Boolean))];
  if (!lista.length && !o.todas) return { cambian: [], saltadas: [], hubspot: new Map() };
  if (o.aplicar && o.ajustarFichas) throw new Error("Cambiar las fichas en memoria es solo para un simulacro.");
  const ctx = await buildCategorizeCtx(o.ajustarFichas);
  const confirmadasAntes = ctx.interlocutoresConfirmados ?? new Map<string, readonly string[]>();
  if (o.hipotesis) {
    const confirmadas = new Map(ctx.interlocutoresConfirmados ?? []);
    const orden = new Map(ctx.clients.map((c, i) => [c.id, i]));
    for (const [correo, fichas] of o.hipotesis) {
      const ids = [...new Set(fichas)].filter((id) => orden.has(id)).sort((a, b) => orden.get(a)! - orden.get(b)!);
      if (ids.length) confirmadas.set(correo.trim().toLowerCase(), ids);
      else confirmadas.delete(correo.trim().toLowerCase());
    }
    ctx.interlocutoresConfirmados = confirmadas;
  }
  const porId = new Map<string, { id: string; title: string; date: Date; participants: string[]; manualClientId: string | null; resolvedClientId: string | null }>();
  if (o.todas) {
    for (const x of await prisma.firefliesSession.findMany({
      select: { id: true, title: true, date: true, participants: true, manualClientId: true, resolvedClientId: true },
    })) {
      porId.set(x.id, x);
    }
  }
  if (o.tambienLasDeLasFichas?.length && !o.todas) {
    const fichas = new Set(o.tambienLasDeLasFichas);
    const pistas = pistasDeTitulo(
      ctx.clients.filter((c) => fichas.has(c.id)),
      ctx.ambiguousNameTokens,
    );
    const gente = new Set<string>();
    for (const mapa of [confirmadasAntes, ctx.interlocutoresConfirmados ?? new Map<string, readonly string[]>()]) {
      for (const [correo, suyas] of mapa) if (suyas.some((id) => fichas.has(id))) gente.add(correo);
    }
    const o2 = [
      ...pistas.map((p) => ({ title: { contains: p, mode: "insensitive" as const } })),
      ...(gente.size ? [{ participants: { hasSome: [...gente] } }] : []),
    ];
    if (o2.length) {
      for (const x of await prisma.firefliesSession.findMany({
        where: { OR: o2 },
        select: { id: true, title: true, date: true, participants: true, manualClientId: true, resolvedClientId: true },
      })) {
        porId.set(x.id, x);
      }
    }
  }
  for (const correo of o.todas ? [] : lista) {
    const suyas = await prisma.firefliesSession.findMany({
      where: { participants: { has: correo } },
      orderBy: { date: "desc" },
      take: MAX_REUNIONES_POR_CONFIRMACION,
      select: { id: true, title: true, date: true, participants: true, manualClientId: true, resolvedClientId: true },
    });
    if (suyas.length >= MAX_REUNIONES_POR_CONFIRMACION) {
      throw new Error(`${correo} tiene ${MAX_REUNIONES_POR_CONFIRMACION} reuniones o más: no se mueve nada para no dejar ninguna afuera sin simulacro.`);
    }
    for (const x of suyas) porId.set(x.id, x);
  }
  const sesiones = [...porId.values()];
  ctx.hubspotCompaniesByDomain = o.hubspot
    ? new Map(o.hubspot)
    : o.exigirHubspot
      ? await mapaDeHubspotSinDegradar(sesiones, ctx.internalDomains)
      : await buildHubspotDomainMap(sesiones, ctx.internalDomains);
  const hubspot: ReadonlyMap<string, HubspotCompanyLite> = ctx.hubspotCompaniesByDomain;
  const cambian: ReunionQueCambia[] = [];
  for (const s of sesiones) {
    const porQue: TrazaDeLaCascada = {};
    const g = categorizeSession(s, ctx, porQue);
    const a = g.kind === "client" ? g.id : null;
    if (a !== s.resolvedClientId) cambian.push({ sessionId: s.id, title: s.title, date: s.date, de: s.resolvedClientId, a, porQue });
  }
  if (!o.aplicar) return { cambian, saltadas: [], hubspot };

  const aprobadas = o.aprobadas;
  const saltadas = aprobadas
    ? cambian.filter((c) => {
        const vista = aprobadas.get(c.sessionId);
        return !vista || vista.de !== c.de || vista.a !== c.a;
      })
    : [];
  const fuera = new Set(saltadas.map((c) => c.sessionId));
  const aMover = cambian.filter((c) => !fuera.has(c.sessionId));
  for (const c of aMover) {
    // Invariante 1: ningún vínculo a un proyecto de otra ficha sobrevive al cambio de dueña (lo mismo que «Mover»), y se
    // suelta en la misma transacción que la mudanza.
    await reResolveSession(c.sessionId, ctx, { reclassify: false, soltarVinculosAjenos: true, esperar: o.esperarLoQueCuelga });
  }
  /* Una aprobada que ya está en su ficha nueva (la movió la app entre el simulacro y la escritura, o una corrida anterior
     que se cortó) no sale en `cambian`, pero sus vínculos a proyectos de la ficha vieja siguen ahí: se sueltan igual
     (revisión del 26 nov). Solo si la cuenta de ahora da esa misma ficha. */
  if (aprobadas) {
    const enCambian = new Set(cambian.map((c) => c.sessionId));
    for (const [sessionId, vista] of aprobadas) {
      const s = porId.get(sessionId);
      if (!vista.a || enCambian.has(sessionId) || !s || s.resolvedClientId !== vista.a) continue;
      await prisma.sessionProject.deleteMany({ where: { sessionId, project: { clientId: { not: vista.a } } } });
    }
  }
  const ganaron = [...new Set(aMover.map((c) => c.a).filter((x): x is string => !!x))];
  if (ganaron.length > MAX_AUTO_RECLASSIFY_CLIENTS) {
    console.warn(`[resolve-client] ${ganaron.length} fichas ganaron reuniones: se omite el auto-reclasificado (scripts/reclassify-client-sessions.ts).`);
  } else {
    const reclasificar = ganaron.map((clientId) =>
      import("./reclassify")
        .then((m) => m.reclassifyClientSessions(clientId))
        .catch(() => {}),
    );
    if (o.esperarLoQueCuelga) await Promise.all(reclasificar);
  }
  return { cambian: aMover, saltadas, hubspot };
}

/**
 * Las fichas que el dominio de este correo da hoy (categorize.ts › `fichasQueDaElDominio`, con el contexto de la
 * materialización y la empresa de HubSpot de ese dominio). Es a quién le quita reuniones FUTURAS confirmar a esta persona en
 * otra ficha: la pestaña de interlocutores pide acceso a ellas (revisión del 25 nov).
 */
export async function fichasDelDominioDe(correo: string): Promise<string[]> {
  const ctx = await buildCategorizeCtx();
  /* La unidad que Nexus aprendió de los títulos para esta persona también pierde sus reuniones futuras si se la confirma en
     otra ficha (revisión del 25 nov: César, aprendido en AE por «AE | …», confirmado en TAE). */
  const aprendida = ctx.personasDeEntidades?.get(correo.trim().toLowerCase());
  const con = (fichas: string[]) => [...new Set([...fichas, ...(aprendida ? [aprendida] : [])])];
  const registradas = fichasQueDaElDominio(correo, ctx);
  if (registradas.length) return con(registradas);
  /* Sin dominio registrado, la ficha puede venir por la empresa de HubSpot ligada (paso 5). Es un control de acceso: si
     HubSpot no responde, se lanza (FALLA CERRADO) en vez de dar el dominio por vacío, como hace la materialización. Un
     correo genérico (gmail, yahoo) nunca da una empresa: no se pregunta. Sin cuenta de HubSpot conectada (la base local),
     el resolver tampoco puede usar el paso 5, así que ese dominio no da ninguna ficha. */
  const dominios = collectExternalDomains([{ participants: [correo] }], ctx.internalDomains).filter((d) => !esDominioGenerico(d));
  if (dominios.length === 0) return con([]);
  try {
    ctx.hubspotCompaniesByDomain = await searchCompaniesByDomains(dominios, { lanzar: true });
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    if (/no hay cuenta hubspot del sistema/i.test(motivo)) return con([]);
    throw new HubspotNoRespondio(motivo);
  }
  return con(fichasQueDaElDominio(correo, ctx));
}

/** HubSpot no respondió en un control que no puede seguir sin él (`fichasDelDominioDe`). */
export class HubspotNoRespondio extends Error {}

/**
 * Como `buildHubspotDomainMap`, pero sin degradar: si HubSpot falla, lanza `HubspotNoRespondio`. Sin cuenta de HubSpot
 * conectada devuelve vacío (el resolver tampoco tiene el paso 5). Los correos genéricos no se preguntan.
 */
async function mapaDeHubspotSinDegradar(sessions: { participants: string[] }[], internalDomains: Set<string>): Promise<Map<string, HubspotCompanyLite>> {
  const dominios = collectExternalDomains(sessions, internalDomains).filter((d) => !esDominioGenerico(d));
  if (dominios.length === 0) return new Map();
  try {
    return await searchCompaniesByDomains(dominios, { lanzar: true });
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    if (/no hay cuenta hubspot del sistema/i.test(motivo)) return new Map();
    throw new HubspotNoRespondio(motivo);
  }
}

export interface ResolveAllResult {
  total: number;
  changed: number;
  nullCount: number;
  /** conteo de sesiones resueltas por clientId (solo las que matchean cliente) */
  byClient: Record<string, number>;
  /** delta por cliente (before→after) de los que cambian — gate del dry-run del re-resolve */
  deltas: { clientId: string; name: string; before: number; after: number }[];
}

/**
 * Re-resuelve TODAS las sesiones. Con `dryRun` solo calcula y devuelve conteos
 * (no escribe). En modo escritura agrupa por valor y usa `updateMany` en chunks
 * (≈ N_clientes llamadas, no 16k).
 */
/** Tope de clientes a auto-reclasificar en una corrida (evita tormenta en imports masivos). */
const MAX_AUTO_RECLASSIFY_CLIENTS = 20;
/** Tope de reuniones frescas que una corrida encola para su lectura de seguimiento (las que ganaron dueño). */
const MAX_LECTURAS_A_ENCOLAR = 100;

export async function resolveAllSessions(opts?: { dryRun?: boolean; reclassify?: boolean }): Promise<ResolveAllResult> {
  const ctx = await buildCategorizeCtx();
  const sessions = await prisma.firefliesSession.findMany({
    select: { id: true, title: true, date: true, participants: true, manualClientId: true, resolvedClientId: true },
  });
  // Señal fuerte: poblar el map de HubSpot con los dominios externos de TODAS las
  // sesiones (1 batch). El paso 5 del cascade resuelve dominio→company→Client ligado.
  ctx.hubspotCompaniesByDomain = await buildHubspotDomainMap(sessions, ctx.internalDomains);

  let changed = 0;
  let nullCount = 0;
  const byClient: Record<string, number> = {};
  const beforeByClient: Record<string, number> = {}; // distribución actual (para el delta)
  // Agrupar las sesiones que cambian por el NUEVO valor → un updateMany por grupo.
  const idsByNewValue = new Map<string | null, string[]>();

  for (const s of sessions) {
    if (s.resolvedClientId) beforeByClient[s.resolvedClientId] = (beforeByClient[s.resolvedClientId] ?? 0) + 1;
    const resolved = resolveSessionClientId(s, ctx);
    if (resolved === null) nullCount++;
    else byClient[resolved] = (byClient[resolved] ?? 0) + 1;
    if (resolved !== s.resolvedClientId) {
      changed++;
      const arr = idsByNewValue.get(resolved) ?? [];
      arr.push(s.id);
      idsByNewValue.set(resolved, arr);
    }
  }

  // Delta por cliente (before→after) para los que cambian — gate del dry-run.
  const nameById = new Map(ctx.clients.map((c) => [c.id, c.name]));
  const deltas = [...new Set([...Object.keys(beforeByClient), ...Object.keys(byClient)])]
    .map((id) => ({ clientId: id, name: nameById.get(id) ?? id, before: beforeByClient[id] ?? 0, after: byClient[id] ?? 0 }))
    .filter((d) => d.before !== d.after)
    .sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before));

  if (!opts?.dryRun) {
    for (const [value, ids] of idsByNewValue) {
      for (let i = 0; i < ids.length; i += 1000) {
        await prisma.firefliesSession.updateMany({
          where: { id: { in: ids.slice(i, i + 1000) } },
          data: { resolvedClientId: value },
        });
      }
    }

    // Cerrar el hueco de timing: resolver ≠ clasificar. Cuando una sesión pasa a ser de un
    // cliente DESPUÉS de que su proyecto ya existe, nada la vinculaba (los triggers de
    // reclasificación disparan al crear proyecto/handoff, no al resolver). Acá, tras
    // materializar nuevos dueños, se re-clasifican los clientes que GANARON sesiones para
    // que se creen los SessionProject faltantes. Fire-and-forget + cap anti-tormenta.
    if (opts?.reclassify !== false) {
      const gained = [...idsByNewValue.keys()].filter((v): v is string => v !== null);
      if (gained.length > MAX_AUTO_RECLASSIFY_CLIENTS) {
        console.warn(
          `[resolve-client] ${gained.length} clientes cambiaron dueño de sesiones — se omite el auto-reclasificado (correr scripts/reclassify-client-sessions.ts si hace falta).`,
        );
      } else {
        for (const clientId of gained) {
          void import("./reclassify")
            .then((m) => m.reclassifyClientSessions(clientId))
            .catch(() => {});
        }
      }
    }

    // La lectura de seguimiento (memoria de la cuenta, etapa 2): una reunión fresca que GANÓ dueño acá (un cliente nuevo,
    // un dominio nuevo) no pasó por el enriquecimiento con ese dueño, así que nadie la encoló, e INV44 la reclamaba
    // para siempre. Se encolan las de los últimos 14 días; la cola decide si corresponde y nunca lanza. En serie y con
    // tope, en segundo plano: una re-resolución que mueve cientos de reuniones no puede disparar cientos de consultas
    // a la vez.
    // Los HECHOS de las reuniones que cambiaron de dueño (memoria de la cuenta, etapa 6): los pendientes del dueño
    // anterior quedan desestimados; el job vuelve a pedirlos en el cliente nuevo. En segundo plano y nunca lanza.
    const manualDe = new Map(sessions.map((s) => [s.id, s.manualClientId]));
    const cambios = [...idsByNewValue].flatMap(([valor, ids]) => ids.map((id) => ({ sessionId: id, duenoNuevo: valor ?? manualDe.get(id) ?? null })));
    if (cambios.length) {
      void import("@/lib/seguimiento/hechos-server")
        .then((m) => m.alCambiarDeDueno(cambios))
        .catch(() => {});
      // El análisis de venta de la dueña anterior ya no vale (S3, invariante 1; INV57). Nunca lanza.
      void import("@/lib/analizador-venta/ajenos")
        .then((m) => m.soltarAnalisisDeVentaAjenos(cambios.map((c) => c.sessionId)))
        .catch(() => {});
    }

    const ganaronDueno = new Set([...idsByNewValue].filter(([valor]) => valor !== null).flatMap(([, ids]) => ids));
    const ahora = Date.now();
    const frescas = sessions
      .filter((s) => ganaronDueno.has(s.id) && +s.date <= ahora && ahora - +s.date <= DIAS_DE_FRESCURA * 86_400_000)
      .map((s) => s.id)
      .slice(0, MAX_LECTURAS_A_ENCOLAR);
    if (frescas.length) {
      void import("@/lib/lecturas/reglas")
        .then(async (r) => {
          if (!r.seguimientoPrendido(process.env)) return;
          const { encolarSeguimiento } = await import("@/lib/lecturas/cola");
          for (const id of frescas) await encolarSeguimiento(id);
        })
        .catch(() => {});
    }
  }

  return { total: sessions.length, changed, nullCount, byClient, deltas };
}
