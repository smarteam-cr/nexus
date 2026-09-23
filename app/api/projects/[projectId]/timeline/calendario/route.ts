import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { guardTimelineEdit } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import {
  MIN_BUSQUEDA_CALENDARIO,
  esReunionDePuertasAdentro,
  motivoParaNoAdoptar,
  motivoParaNoElegirDelCalendario,
} from "@/lib/sessions/candidatas-internas";
import { buildInternalDomainsSet } from "@/lib/sessions/categorize";
import { belongsToClient } from "@/lib/sessions/project-sources";

/** Sin escribir nada: las más recientes. Es lo que se ve al abrir el buscador. */
const TOPE_RECIENTES = 30;
/** Buscando: en todo el historial, hasta este tope. */
const TOPE_BUSQUEDA = 50;

/**
 * GET /api/projects/[projectId]/timeline/calendario?q=
 *
 * «De tu calendario» del buscador del Contexto del cronograma (2026-09-23, pedido de Elías: «el
 * usuario debe poder buscar cualquier sesión de su calendario o de cualquiera de las incluidas»).
 * Las reuniones del PROYECTO las trae session-candidates?para=cronograma; acá van las de quien
 * busca: donde fue organizador o invitado, que todavía no son de este proyecto.
 *
 *   · sin `q` (o con menos de MIN_BUSQUEDA_CALENDARIO letras) → sus TOPE_RECIENTES más recientes;
 *   · con `q` → todo su historial (título, organizador o participantes), hasta TOPE_BUSQUEDA.
 * `hayMas` dice si quedó algo afuera: una lista cortada no puede leerse como completa.
 *
 * Una reunión de OTRO cliente se devuelve igual, marcada con su motivo y sin botón: esconderla sería
 * que alguien la busque en su calendario y crea que no existe. La puerta (timeline/sessions) la
 * rechaza por su cuenta. Las futuras quedan afuera: no dejaron nada que leer.
 *
 * Solo lectura. El guard es el de EDITAR el cronograma: el buscador existe para elegir, y quien no
 * puede elegir no lo abre.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;

  const email = (guard.teamMember.email ?? "").trim().toLowerCase();
  if (!email) return NextResponse.json({ sesiones: [], hayMas: false });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  const buscando = q.length >= MIN_BUSQUEDA_CALENDARIO;
  const tope = buscando ? TOPE_BUSQUEDA : TOPE_RECIENTES;
  /* ILIKE con el patrón escapado: un «%» o un «_» que la persona escriba se busca literal. */
  const patron = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const filtroTexto = buscando
    ? Prisma.sql`AND (
        s."title" ILIKE ${patron}
        OR s."organizerEmail" ILIKE ${patron}
        OR EXISTS (SELECT 1 FROM unnest(s."participants") p WHERE p ILIKE ${patron})
      )`
    : Prisma.empty;

  /* Se pide uno más que el tope para saber si hay más sin contarlas todas. Las que ya son del
     proyecto (vínculo vivo) no van: están arriba, en la lista del proyecto. */
  const ahora = new Date();
  const encontradas = await prisma.$queryRaw<{ id: string }[]>`
    SELECT s."id"
    FROM "FirefliesSession" s
    WHERE s."date" <= ${ahora}
      AND (
        lower(s."organizerEmail") = ${email}
        OR EXISTS (SELECT 1 FROM unnest(s."participants") p WHERE lower(p) = ${email})
      )
      AND NOT EXISTS (
        SELECT 1 FROM "SessionProject" sp
        WHERE sp."sessionId" = s."id" AND sp."projectId" = ${projectId} AND sp."included" = true
      )
      ${filtroTexto}
    ORDER BY s."date" DESC
    LIMIT ${tope + 1}`;
  const hayMas = encontradas.length > tope;
  const ids = encontradas.slice(0, tope).map((r) => r.id);
  if (ids.length === 0) return NextResponse.json({ sesiones: [], hayMas: false });

  const [filas, categorias, conContenidoRows] = await Promise.all([
    prisma.firefliesSession.findMany({
      where: { id: { in: ids } },
      orderBy: { date: "desc" },
      select: {
        id: true,
        title: true,
        date: true,
        participants: true,
        organizerEmail: true,
        duration: true,
        resolvedClientId: true,
        manualClientId: true,
        projects: { select: { projectId: true, project: { select: { clientId: true } } } },
      },
    }),
    prisma.sessionCategory.findMany({ select: { domains: true, kind: true } }),
    /* «Hay ALGO que leer» = transcript, resumen o minuta — el mismo criterio que el resto del
       buscador. En SQL para no traer los blobs al servidor. */
    prisma.$queryRaw<{ id: string }[]>`
      SELECT s."id"
      FROM "FirefliesSession" s
      WHERE s."id" IN (${Prisma.join(ids)})
        AND (
          coalesce(length(s."transcript"), 0) > 0
          OR s."summary" IS NOT NULL
          OR EXISTS (SELECT 1 FROM "SessionMinute" m WHERE m."sessionId" = s."id")
        )`,
  ]);
  const dominiosPropios = buildInternalDomainsSet(categorias);
  const conContenido = new Set(conContenidoRows.map((r) => r.id));

  // El nombre del dueño, para decir DE QUIÉN es la reunión que no se puede elegir.
  const duenios = [
    ...new Set(
      filas
        .filter((s) => !belongsToClient(s, guard.clientId))
        .map((s) => s.manualClientId ?? s.resolvedClientId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const nombres = new Map(
    (duenios.length
      ? await prisma.client.findMany({ where: { id: { in: duenios } }, select: { id: true, name: true } })
      : []
    ).map((c) => [c.id, c.name]),
  );

  const sesiones = filas.map((s) => {
    const sinDuenio = s.resolvedClientId === null && s.manualClientId === null;
    const motivoNoAdoptable = sinDuenio
      ? motivoParaNoAdoptar(
          {
            participants: s.participants,
            organizerEmail: s.organizerEmail,
            clientesDeSusProyectos: s.projects.map((p) => p.project.clientId),
          },
          guard.clientId,
          dominiosPropios,
        )
      : null;
    const duenio = s.manualClientId ?? s.resolvedClientId;
    return {
      sessionId: s.id,
      title: s.title,
      date: s.date,
      participants: s.participants,
      organizerEmail: s.organizerEmail,
      duration: s.duration,
      // El cronograma no tiene regla de relevancia: nada se destaca ni se atenúa por el título.
      applies: true,
      reason: "",
      linkedElsewhere: s.projects.some((p) => p.projectId !== projectId),
      excluidaAca: false,
      sinContenido: !conContenido.has(s.id),
      sinDuenio,
      soloEquipo: sinDuenio ? esReunionDePuertasAdentro(s, dominiosPropios) : undefined,
      /* Mismo campo que usa la búsqueda de sin dueño: con motivo, la fila no ofrece «Agregar» sino
         ir a Sesiones. */
      motivoNoAdoptable: motivoParaNoElegirDelCalendario({
        perteneceAlCliente: belongsToClient(s, guard.clientId),
        sinDuenio,
        motivoNoAdoptable,
        nombreDelDuenio: duenio ? (nombres.get(duenio) ?? null) : null,
      }),
    };
  });

  return NextResponse.json({ sesiones, hayMas });
}
