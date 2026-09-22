import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { classifyHandoffSession } from "@/lib/handoff/session-relevance";
import { salesPresenceEmails } from "@/lib/handoff/sales-presence";
import {
  MIN_BUSQUEDA_SIN_DUENIO,
  PISO_REUNIONES_INTERNAS,
  esReunionDePuertasAdentro,
  motivoParaNoAdoptar,
} from "@/lib/sessions/candidatas-internas";
import { buildInternalDomainsSet } from "@/lib/sessions/categorize";

/** Tope de resultados: el caso de uso es encontrar UNA reunión que se escribe por su nombre. */
const TOPE_SIN_DUENIO = 30;

/**
 * GET /api/projects/[projectId]/session-candidates/sin-duenio?q=
 *
 * Las reuniones que NO son de ningún cliente (ni resueltas ni asignadas a mano) cuyo título,
 * organizador o participantes contienen `q`. Alimenta el buscador del modal «Buscar sesiones» del
 * Contexto de CUALQUIER proyecto.
 *
 * Por qué existe (2026-09-22): «[Sales & Service handoff] CAV» tenía transcripción pero era 100 %
 * interna y su título usaba la sigla del cliente, así que la atribución por título no la encontró y
 * quedó sin dueño. El modal solo ofrece reuniones DEL CLIENTE, y la lista de huérfanas está gateada
 * a proyectos internos (session-candidates), así que no había cómo llegar a ella desde el proyecto.
 *
 * Qué NO cambia: a un proyecto normal nunca se le ofrece la lista completa de huérfanas (serían
 * miles), solo lo que coincide con lo que la persona escribió, y con al menos
 * MIN_BUSQUEDA_SIN_DUENIO letras. Agregar una la adopta para el cliente del proyecto
 * (handoff-sessions → adoptarSesionSinDuenio), y solo con un clic las que `motivoParaNoAdoptar`
 * deja: las que tuvieron gente de afuera o ya cuelgan de otro cliente se asignan desde Sesiones.
 * Solo lectura acá.
 *
 * Sin fugas nuevas: las mismas reuniones ya las ve cualquier usuario interno en /sessions
 * («Del equipo, sin dueño»), y este endpoint exige acceso al proyecto.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < MIN_BUSQUEDA_SIN_DUENIO) return NextResponse.json({ sesiones: [] });

  /* ILIKE con el patrón escapado: un «%» o un «_» que la persona escriba se busca literal. Las
     futuras quedan afuera (el resto del modal tampoco las ofrece) y el piso de 2026 es el mismo que
     el del grupo interno. */
  const patron = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const ahora = new Date();
  const encontradas = await prisma.$queryRaw<{ id: string }[]>`
    SELECT s."id"
    FROM "FirefliesSession" s
    WHERE s."resolvedClientId" IS NULL
      AND s."manualClientId" IS NULL
      AND s."date" >= ${PISO_REUNIONES_INTERNAS}
      AND s."date" <= ${ahora}
      AND (
        s."title" ILIKE ${patron}
        OR s."organizerEmail" ILIKE ${patron}
        OR EXISTS (SELECT 1 FROM unnest(s."participants") p WHERE p ILIKE ${patron})
      )
    ORDER BY s."date" DESC
    LIMIT ${TOPE_SIN_DUENIO}`;
  if (encontradas.length === 0) return NextResponse.json({ sesiones: [] });
  const ids = encontradas.map((r) => r.id);

  const [filas, salesEmails, categorias, conContenidoRows] = await Promise.all([
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
        projects: { select: { projectId: true, project: { select: { clientId: true } } } },
      },
    }),
    salesPresenceEmails(),
    prisma.sessionCategory.findMany({ select: { domains: true, kind: true } }),
    /* Mismo criterio que el modal: «hay ALGO que leer» = transcript, resumen o minuta. En SQL para
       no traer los blobs al servidor. */
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

  const sesiones = filas.map((s) => {
    const cls = classifyHandoffSession(s.title, s.participants, s.organizerEmail, salesEmails);
    return {
      sessionId: s.id,
      title: s.title,
      date: s.date,
      participants: s.participants,
      organizerEmail: s.organizerEmail,
      duration: s.duration,
      applies: cls.include,
      reason: cls.reason,
      linkedElsewhere: s.projects.some((p) => p.projectId !== projectId),
      excluidaAca: false,
      sinContenido: !conContenido.has(s.id),
      sinDuenio: true,
      /* Solo gente nuestra en la sala: se rotula «reunión del equipo». Si hay alguien de afuera
         cuyo dominio no es de ningún cliente, se rotula «sin cliente asignado». */
      soloEquipo: esReunionDePuertasAdentro(s, dominiosPropios),
      /* Se muestran TODAS las que coinciden, pero solo las que no dejan nada que decidir se
         asignan con un clic. El resto trae el motivo y se asigna desde Sesiones: la misma regla
         la aplica handoff-sessions al escribir, así que el botón nunca promete lo que la puerta
         va a rechazar. */
      motivoNoAdoptable: motivoParaNoAdoptar(
        {
          participants: s.participants,
          organizerEmail: s.organizerEmail,
          clientesDeSusProyectos: s.projects.map((p) => p.project.clientId),
        },
        guard.clientId,
        dominiosPropios,
      ),
    };
  });

  return NextResponse.json({ sesiones });
}
