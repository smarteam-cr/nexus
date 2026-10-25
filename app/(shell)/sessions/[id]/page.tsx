import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireAccessToClient } from "@/lib/auth/access";
import { requireInternalUser, ForbiddenError, UnauthorizedError, type AppUserWithTeamMember } from "@/lib/auth/supabase";
import { proyectoClasificableWhere } from "@/lib/projects/scope";
import { duenoDeLaSesion } from "@/lib/sessions/project-sources";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { cargarTarjeta } from "@/lib/seguimiento/tarjeta-server";
import { tarjetaTieneAlgo } from "@/lib/seguimiento/tarjeta";
import LoQueDejoLaReunion from "@/components/seguimiento/LoQueDejoLaReunion";
import LeerEstaReunion from "@/components/seguimiento/LeerEstaReunion";
import { queSeLee } from "@/lib/lecturas/reglas";
import { tieneTexto } from "@/lib/sessions/tiene-texto";
import { contextoDeTareas, tareasDisponible } from "@/lib/tareas/servidor";
import { contarTareasDeLaReunion } from "@/lib/tareas/consultas";
import { invitadosDe } from "@/lib/contactos/lectura-server";
import { cargarPaginaDeLaReunion } from "@/lib/seguimiento/reunion/pagina-server";
import { esLiderDeCs } from "@/lib/cs/acceso";
import { largoDeLasNotas } from "@/lib/sessions/tiene-texto";
import { motivoEnLaReunion, motivoParaMostrar } from "@/lib/sessions/motivo-sin-texto";
import { estuvoEnLaReunion } from "@/lib/sessions/preguntas-de-contexto";
import { preguntasParaLaReunion } from "@/lib/sessions/preguntas-de-contexto-server";
import { audioPrendido } from "@/lib/sessions/audio-de-reunion";
import { audioDeLaReunion } from "@/lib/sessions/audio-de-reunion-server";
import { porQueLaPropone, puedeDecidirLaEmpresa } from "@/lib/sessions/propuesta-de-empresa";
import { propuestasDe } from "@/lib/sessions/propuesta-de-empresa-server";
import { empresasParaElegir } from "@/lib/sessions/empresa-de-la-reunion-server";
import { SinTextoDeLaReunion } from "@/components/sessions/reunion/SinTextoDeLaReunion";
import { SinEmpresaDeLaReunion } from "@/components/sessions/reunion/SinEmpresaDeLaReunion";
import SessionView, { type PaginaDeLaVista, type SessionViewData } from "./SessionView";

export const dynamic = "force-dynamic";

/**
 * Vista unificada de UNA reunión: combina transcript + minuta + las tareas que dejó +
 * cards generadas + prep (si futura). Es el corazón del flujo del CSE.
 *
 * Desde el 2026-10-09 (memoria de la cuenta, etapa 1):
 *   · el dueño de la reunión es `resolvedClientId` (el manual solo si no hay), sin recategorizar acá;
 *   · con dueño, pide ACCESO a ese cliente: sin acceso, 404 (antes cualquiera del equipo leía cualquier transcripción);
 *   · arriba de las pestañas va «Lo que dejó esta reunión» (lib/seguimiento), si la reunión tiene tarjeta; y «Leer esta
 *     reunión» si todavía no tiene minuta (desde el 2026-10-10).
 * Desde el 2026-10-10 (etapa 2): «N tareas» cuenta las tareas que dejó, de las que ve quien mira (`ActionItem` se retiró).
 * Desde el 2026-10-17 (ficha G): cada reunión con su página: su agenda, sus avisos, sus tareas con responsable y, si fue
 * con un cliente, el correo de seguimiento y la próxima reunión sugerida (lib/seguimiento/reunion/pagina-server.ts).
 * Desde el 2026-10-25 (T3, T4, T5 y T9 de docs/reuniones-pieza-angular-plan.md): una reunión SIN EMPRESA deja decidirla
 * acá, con la propuesta de Nexus; una que terminó SIN TEXTO dice por qué y, a quien la organizó, cómo evitarlo; quien
 * estuvo responde las preguntas de Nexus, y se puede subir el audio de una presencial. Esos dos bloques reemplazan los
 * avisos «No tiene cliente» y «Terminó sin transcripción ni notas».
 */

/** Cuántas tareas dejó la reunión, de las que ve quien mira. Sin las tablas de Tareas (o sin un SQL), 0: la página se ve igual. */
async function tareasQueDejo(sessionId: string, user: AppUserWithTeamMember): Promise<number> {
  if (!user.teamMember || !(await tareasDisponible())) return 0;
  try {
    return await contarTareasDeLaReunion(await contextoDeTareas(user), sessionId);
  } catch (e) {
    if (esquemaDesactualizado(e)) return 0;
    throw e;
  }
}
export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let user: AppUserWithTeamMember;
  let rol: string;
  try {
    ({ user, role: rol } = await requireInternalUser());
  } catch {
    redirect("/");
  }

  const { id } = await params;

  // 1. Cargar la sesión + minuta + cuántas tareas dejó + asignaciones de proyecto (paralelo)
  const [session, minute, tareasDeLaReunion, agentRuns, projectAssignments] =
    await Promise.all([
      prisma.firefliesSession.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          date: true,
          duration: true,
          participants: true,
          summary: true,
          transcript: true,
          enrichedAt: true,
          enrichAttempts: true,
          enrichError: true,
          canceladaEn: true,
          source: true,
          googleDocId: true,
          organizerEmail: true,
          resolvedClientId: true,
          manualClientId: true,
          descripcionDelEvento: true,
        },
      }),
      prisma.sessionMinute.findUnique({
        where: { sessionId: id },
        select: {
          id: true,
          summary: true,
          agreements: true,
          decisions: true,
          risks: true,
          topics: true,
          status: true,
          reviewedAt: true,
          reviewedByEmail: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      tareasQueDejo(id, user),
      // Cards generadas por agentes que usaron esta sesión como input
      prisma.agentRun.findMany({
        where: { sourceSessionIds: { has: id } },
        select: {
          id: true,
          createdAt: true,
          agent: { select: { name: true } },
          cards: {
            select: {
              id: true,
              title: true,
              content: true,
              canvasSection: true,
            },
            orderBy: { order: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      // F3-C: asignaciones SessionProject para esta sesión
      prisma.sessionProject.findMany({
        where: { sessionId: id },
        orderBy: [{ isPrimary: "desc" }, { confidence: "desc" }],
        select: {
          projectId: true,
          isPrimary: true,
          source: true,
          confidence: true,
          rationale: true,
          project: {
            select: { id: true, name: true, serviceType: true, clientId: true },
          },
        },
      }),
    ]);

  if (!session) notFound();

  // 2. El dueño de la reunión: `resolvedClientId` (el manual solo si no hay). Con dueño, hace falta acceso a ese
  //    cliente; sin acceso, la reunión no existe para quien mira.
  const duenoId = duenoDeLaSesion(session);
  if (duenoId) {
    try {
      await requireAccessToClient(duenoId);
    } catch (e) {
      if (e instanceof ForbiddenError || e instanceof UnauthorizedError) notFound();
      throw e;
    }
  }
  const matchedClient = duenoId
    ? await prisma.client.findUnique({ where: { id: duenoId }, select: { id: true, name: true, company: true, kind: true } })
    : null;

  // «Lo que dejó esta reunión». Si a la base le falta un SQL, la página se ve igual, sin la tarjeta.
  const tarjeta = await cargarTarjeta(id, user).catch((e) => {
    if (esquemaDesactualizado(e)) return null;
    throw e;
  });

  // 3. Cargar TeamMembers para selector de owner
  const teamMembers = await prisma.teamMember.findMany({
    where: { deactivatedAt: null }, // selector de owner: solo miembros activos
    select: { email: true, name: true, area: true },
    orderBy: [{ area: "asc" }, { name: "asc" }],
  });

  // 4. Proyectos del cliente matched (para el selector de override manual)
  const availableProjects = matchedClient
    ? await prisma.project.findMany({
        where: proyectoClasificableWhere({ clientId: matchedClient.id }),
        select: { id: true, name: true, serviceType: true },
        orderBy: { createdAt: "desc" },
      })
    : [];

  // Quién estuvo, con nombre y cargo: el equipo y los contactos de HubSpot del DUEÑO de la reunión (etapa 6a).
  const invitados = await invitadosDe(session.participants, duenoId).catch(() => null);

  const data: SessionViewData = {
    session: {
      id: session.id,
      title: session.title,
      date: session.date.toISOString(),
      duration: session.duration,
      participants: session.participants,
      invitados,
      transcript: session.transcript,
      googleDocId: session.googleDocId,
      organizerEmail: session.organizerEmail,
      source: session.source,
      summary: session.summary as { overview?: string } | null,
    },
    client: matchedClient
      ? { id: matchedClient.id, name: matchedClient.name, company: matchedClient.company }
      : null,
    minute: minute
      ? {
          id: minute.id,
          summary: minute.summary,
          agreements: (minute.agreements as { text: string }[] | null) ?? [],
          decisions: (minute.decisions as { text: string; rationale?: string }[] | null) ?? [],
          risks:
            (minute.risks as { text: string; severity?: "low" | "med" | "high" }[] | null) ?? [],
          topics: (minute.topics as string[] | null) ?? [],
          status: minute.status,
          reviewedAt: minute.reviewedAt?.toISOString() ?? null,
          reviewedByEmail: minute.reviewedByEmail,
          updatedAt: minute.updatedAt.toISOString(),
        }
      : null,
    tareasDeLaReunion,
    cardsBySource: agentRuns
      .filter((r) => r.cards.length > 0)
      .map((r) => ({
        runId: r.id,
        agentName: r.agent?.name ?? "Agente",
        ranAt: r.createdAt.toISOString(),
        cards: r.cards.map((c) => ({
          id: c.id,
          title: c.title,
          content: c.content,
          canvasSection: c.canvasSection,
        })),
      })),
    // El componente espera `role` (label de área para mostrar) — alimentado desde `area`.
    teamMembers: teamMembers.map((m) => ({ email: m.email, name: m.name, role: m.area })),
    // F3-C: asignaciones a proyecto + lista de proyectos disponibles
    projectAssignments: projectAssignments.map((a) => ({
      projectId: a.projectId,
      projectName: a.project.name,
      serviceType: a.project.serviceType,
      isPrimary: a.isPrimary,
      source: a.source,
      confidence: a.confidence,
      rationale: a.rationale,
    })),
    availableProjects: availableProjects.map((p) => ({
      id: p.id,
      name: p.name,
      serviceType: p.serviceType,
    })),
  };

  // Ficha G: la agenda, los avisos, las tareas y «Después de la reunión». Si a la base le falta el SQL, la página se ve
  // como antes (las lecturas que dependen de él salen vacías adentro; acá, por si falla el resto).
  // El predicado único (lib/sessions/tiene-texto.ts): transcripción, o solo notas de Gemini que alcanzan para leerlas. Y
  // lo que la lectura sí lee aunque sea corto (`queSeLee`: lo que recuerda quien la agregó a mano, desde 40 letras): si
  // no, la página diría «no tiene qué leer» al lado de «Leer esta reunión».
  const textoDeLaReunion = tieneTexto(session) || queSeLee(session, process.env).fuente !== null;
  const pagina: PaginaDeLaVista | undefined = await cargarPaginaDeLaReunion({
    sessionId: session.id,
    user,
    reunion: {
      titulo: session.title,
      fecha: session.date,
      duracionMin: Math.round(session.duration || 0),
      participantes: session.participants,
      organizador: session.organizerEmail,
      descripcion: session.descripcionDelEvento,
      tieneTexto: textoDeLaReunion,
      enriquecida: !!session.enrichedAt,
    },
    dueno: matchedClient ? { id: matchedClient.id, nombre: matchedClient.name, kind: matchedClient.kind } : null,
    proyectosDelCliente: availableProjects.length,
    proyectosVinculados: matchedClient ? projectAssignments.filter((a) => a.project.clientId === matchedClient.id).length : 0,
  })
    .then((pg) => ({ ...pg, tuyasPorDecidir: tarjeta ? tarjeta.secciones.tareas.items.length + tarjeta.secciones.tareas.mas : 0 }))
    .catch((e) => {
      if (esquemaDesactualizado(e)) return undefined;
      throw e;
    });

  // ── T3 y T4: sin empresa, y sin texto (los bloques reemplazan sus avisos) ──
  const ahora = new Date();
  const estuvo = estuvoEnLaReunion({ organizador: session.organizerEmail, participantes: session.participants }, user.email);
  const termino = +session.date + Math.max(0, session.duration || 0) * 60_000 <= +ahora;
  // El motivo guardado (T4) se lee aparte: sin el SQL del 2026-10-25 la columna no existe y se calcula al leer.
  const guardado = await prisma.firefliesSession
    .findUnique({ where: { id }, select: { motivoSinTexto: true } })
    .then((f) => f?.motivoSinTexto ?? null)
    .catch(() => null);
  const motivo =
    !textoDeLaReunion && termino
      ? motivoEnLaReunion(
          motivoParaMostrar(
            guardado,
            {
              date: session.date,
              duration: session.duration,
              enrichedAt: session.enrichedAt,
              enrichAttempts: session.enrichAttempts,
              enrichError: session.enrichError,
              googleDocId: session.googleDocId,
              organizerEmail: session.organizerEmail,
              participants: session.participants,
              tieneNotas: largoDeLasNotas(session.summary) > 0,
              canceladaEn: session.canceladaEn,
            },
            ahora,
          ),
          estuvo,
        )
      : null;
  const [preguntas, audio] = motivo
    ? await Promise.all([
        matchedClient && estuvo
          ? preguntasParaLaReunion({ sessionId: id, dueno: matchedClient.id, empresa: matchedClient.name, titulo: session.title, fecha: session.date })
          : Promise.resolve(null),
        matchedClient && audioPrendido(process.env) ? audioDeLaReunion(id).then((a) => ({ inicial: a })) : Promise.resolve(null),
      ])
    : [null, null];
  const sinEmpresa = !duenoId
    ? await Promise.all([propuestasDe([id]), empresasParaElegir(user)]).then(([ps, empresas]) => {
        const p = ps.get(id);
        const viva = p && !p.decision ? p : null;
        return {
          propuesta: viva ? { tipo: viva.tipo, nombre: viva.nombre, clientId: viva.clientId, hubspotCompanyId: viva.hubspotCompanyId } : null,
          porque: viva ? porQueLaPropone(viva) : null,
          empresas,
          puedeDecidir: puedeDecidirLaEmpresa({ organizador: session.organizerEmail, participantes: session.participants }, { email: user.email, veTodo: esLiderDeCs(rol) }),
        };
      })
    : null;
  const bloques =
    sinEmpresa || motivo ? (
      <>
        {sinEmpresa && <SinEmpresaDeLaReunion sessionId={id} titulo={session.title} {...sinEmpresa} />}
        {motivo && (
          <SinTextoDeLaReunion
            sessionId={id}
            motivo={motivo}
            preguntas={preguntas}
            cliente={matchedClient ? { id: matchedClient.id, nombre: matchedClient.name } : null}
            audio={audio}
          />
        )}
      </>
    ) : undefined;
  const paginaConBloques = pagina
    ? { ...pagina, avisos: pagina.avisos.filter((a) => !(motivo && a.clave === "sin-texto") && !(sinEmpresa && a.clave === "sin-cliente")) }
    : pagina;

  // «Lo que dejó esta reunión» sin los compromisos: la página los muestra en «Tareas de esta reunión», con responsable.
  const tarjetaSinCompromisos = tarjeta && pagina ? { ...tarjeta, secciones: { ...tarjeta.secciones, compromisos: { items: [], mas: 0, href: null } } } : tarjeta;

  // «Leer esta reunión»: una reunión con tarjeta (de un cliente o un prospecto, no de puertas adentro, y que quien mira
  // puede ver), con transcripción y sin minuta. Es el camino de una persona cuando la cola no la leyó (el remedio de INV44).
  // Se puede leer a mano lo mismo que lee la cola (`queSeLee`): la transcripción, lo que recuerda alguien o, con la
  // bandera prendida, las notas de Gemini (T2).
  const puedeLeer = !!tarjeta && !minute && queSeLee(session, process.env).fuente !== null;
  const arriba =
    tarjetaSinCompromisos && tarjetaTieneAlgo(tarjetaSinCompromisos) ? (
      <>
        <LoQueDejoLaReunion inicial={tarjetaSinCompromisos} sinCompromisos={!!pagina} />
        {puedeLeer && <LeerEstaReunion sessionId={session.id} />}
      </>
    ) : puedeLeer ? (
      <LeerEstaReunion sessionId={session.id} />
    ) : undefined;

  return <SessionView data={data} tarjeta={arriba} pagina={paginaConBloques} bloques={bloques} />;
}
