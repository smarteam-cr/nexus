import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { classifyHandoffSession, linkFeedsHandoff } from "@/lib/handoff/session-relevance";
import { salesPresenceEmails } from "@/lib/handoff/sales-presence";
import {
  PISO_REUNIONES_INTERNAS,
  esReunionDePuertasAdentro,
} from "@/lib/sessions/candidatas-internas";
import { buildInternalDomainsSet } from "@/lib/sessions/categorize";
import { belongsToClient, whereBelongsToClient } from "@/lib/sessions/project-sources";

/**
 * GET /api/projects/[projectId]/session-candidates
 *
 * Para la selección revisable del handoff (A2 rediseñado). Devuelve:
 *   - feeding: las sesiones que ALIMENTAN el handoff (panel limpio) según la política
 *     de link `linkFeedsHandoff` (session-relevance): override=true fuerza; override=false
 *     excluye; sin override, solo links PRIMARIOS o secundarios de confianza alta cuya
 *     regla de relevancia aplique (título handoff/kickoff o Ventas en la sala).
 *   - candidates: las DEMÁS sesiones del cliente (pop-up "Buscar más"), con `applies`
 *     (¿la regla la incluiría?) para destacarlas. Agregar una la fuerza al handoff.
 *
 * Solo lectura. Incluir/excluir va por POST /api/projects/[projectId]/handoff-sessions.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const { clientId } = guard;

  const salesEmails = await salesPresenceEmails();
  const applies = (title: string, participants: string[], organizerEmail: string | null): boolean =>
    classifyHandoffSession(title, participants, organizerEmail, salesEmails).include;

  const linkedRows = await prisma.sessionProject.findMany({
    where: { projectId },
    select: {
      source: true,
      confidence: true,
      rationale: true,
      handoffOverride: true,
      included: true,
      reviewedAt: true,
      isPrimary: true,
      session: {
        select: {
          id: true, title: true, date: true, participants: true, organizerEmail: true,
          resolvedClientId: true, manualClientId: true,
        },
      },
    },
  });

  // Defensa de runtime (chokepoint): descartar links a sesiones que ya NO son de este
  // cliente (stale/legacy/cross-client). El ownership lo manda resolvedClientId/manualClientId.
  const safeRows = linkedRows.filter((r) => belongsToClient(r.session, clientId));
  if (safeRows.length !== linkedRows.length) {
    console.warn(
      `[session-candidates] project=${projectId}: descartados ${linkedRows.length - safeRows.length} link(s) cross-client`,
    );
  }

  // ¿Esta sesión linkeada alimenta el handoff? Excluida de la membresía del proyecto
  // (included=false, tombstone humano) no alimenta NADA; si es miembro, aplica la
  // política de link (primario / confianza alta / forzada) + la regla de relevancia.
  const feeds = (r: (typeof linkedRows)[number]): boolean =>
    r.included &&
    linkFeedsHandoff(
      { isPrimary: r.isPrimary, confidence: r.confidence, handoffOverride: r.handoffOverride },
      applies(r.session.title, r.session.participants, r.session.organizerEmail),
    );

  // Atribución multi-proyecto: nombres de los OTROS proyectos donde también está
  // linkeada cada sesión de este proyecto. La UI muestra "también en: X" para que el
  // CSE identifique (y pueda excluir) el cruce cuando un cliente tiene varios proyectos.
  const linkedSessionIds = safeRows.map((r) => r.session.id);
  const otherLinks = linkedSessionIds.length
    ? await prisma.sessionProject.findMany({
        where: { sessionId: { in: linkedSessionIds }, projectId: { not: projectId } },
        select: { sessionId: true, project: { select: { name: true } } },
      })
    : [];
  const alsoInBySession = new Map<string, string[]>();
  for (const l of otherLinks) {
    const arr = alsoInBySession.get(l.sessionId) ?? [];
    arr.push(l.project.name);
    alsoInBySession.set(l.sessionId, arr);
  }

  const feeding = safeRows
    .filter(feeds)
    .sort((a, b) => b.session.date.getTime() - a.session.date.getTime())
    .map((r) => ({
      sessionId: r.session.id,
      title: r.session.title,
      date: r.session.date,
      participants: r.session.participants,
      source: r.source,
      confidence: r.confidence,
      rationale: r.rationale,
      forced: r.handoffOverride === true,
      alsoIn: alsoInBySession.get(r.session.id) ?? [],
      // Por qué alimenta (con la política nueva no hay otro caso): la UI lo muestra en la fila.
      origin: r.handoffOverride === true ? "forzada a mano" : r.isPrimary ? "primaria" : "confianza alta",
      /* ⚠ Los dos grupos de CANDIDATAS excluyen las futuras (`date: { lte: new Date() }`), pero
         `feeding` nunca tuvo ese filtro: una reunión que todavía no ocurrió puede estar
         alimentando un handoff y ser invisible en todas las listas. Medido: 30 vínculos así hoy.

         No se filtra acá —sacarla en silencio sería quitarle contenido a un documento sin
         decirlo, que es el pecado que esta tanda vino a matar— se MARCA, y quien la puso decide. */
      futura: r.session.date.getTime() > Date.now(),
    }));
  const feedingIds = new Set(feeding.map((f) => f.sessionId));

  // Excluidas A MANO (handoffOverride===false): la "X" del panel las sacó del handoff
  // pero siguen siendo del proyecto. Se muestran como "Excluida" con un toggle para
  // re-incluirlas — es la reversa visible del anclaje de la Fase 1, sin ir al modal.
  const excluded = safeRows
    .filter((r) => r.included && r.handoffOverride === false)
    .sort((a, b) => b.session.date.getTime() - a.session.date.getTime())
    .map((r) => ({
      sessionId: r.session.id,
      title: r.session.title,
      date: r.session.date,
      alsoIn: alsoInBySession.get(r.session.id) ?? [],
    }));
  const excludedIds = new Set(excluded.map((e) => e.sessionId));

  // Candidatas para el pop-up: todas las sesiones del cliente que NO alimentan ya el
  // handoff (incluye las linkeadas-pero-excluidas y las no linkeadas). `applies` marca
  // las que entrarían por regla, para destacarlas arriba. Ownership = misma regla que
  // belongsToClient (resolvedClientId O manualClientId) — antes solo resolvedClientId
  // y una sesión asignada a mano desaparecía de la columna Y del modal.
  const clientSessions = await prisma.firefliesSession.findMany({
    where: {
      ...whereBelongsToClient(clientId),
      date: { lte: new Date() },
    },
    orderBy: { date: "desc" },
    take: 100,
    select: {
      id: true,
      title: true,
      date: true,
      participants: true,
      organizerEmail: true,
      duration: true,
      projects: { select: { projectId: true } },
    },
  });

  /* ── El SEGUNDO grupo: las reuniones del equipo que nadie reclamó ────────────
     Solo para proyectos INTERNOS. Sin el gate, TODO proyecto de TODO cliente empezaría a ofrecer
     ~4.900 reuniones de Smarteam con Smarteam para meter en documentos que el cliente lee — una
     fuga a escala, y encima una lista inutilizable.

     ⚠ La segunda razón que justificaba este gate MURIÓ el 2026-08-12: era "un interno tiene la
     publicación apagada por OVERLAY_INTERNO, así que ese handoff no sale de casa ni por error".
     Ya no: un interno SÍ es publicable (el enlace externo con token + contraseña, para mostrarle
     el cronograma a stakeholders). O sea que este material ahora PUEDE viajar en un documento
     publicado. Se decidió a sabiendas: el destinatario de un interno publicado es de casa, y el
     enlace no es público. Si algún día eso deja de ser cierto, el lugar para atajarlo es acá —
     este gate es lo único que separa las reuniones de puertas adentro del resto del sistema. */
  const huerfanas = guard.interno
    ? await prisma.firefliesSession.findMany({
        where: {
          // Sin dueño por las dos vías: si ya es de alguien, o aparece arriba o no es de acá.
          resolvedClientId: null,
          manualClientId: null,
          date: { gte: PISO_REUNIONES_INTERNAS, lte: new Date() },
        },
        orderBy: { date: "desc" },
        /* ⚠ SIN `take` acá. El tope tiene que ir DESPUÉS de filtrar por "puertas adentro", no
           antes: de las ~4.900 sesiones sin dueño solo una fracción son reuniones del equipo, así
           que cortar en crudo dejaba fuera de alcance todo lo que no fuera la cola más reciente —
           y el buscador del modal filtra en el navegador, sobre lo que ya llegó, así que no había
           segunda puerta. El caso de uso entero de este grupo es encontrar UNA reunión vieja. */
        select: {
          id: true,
          title: true,
          date: true,
          participants: true,
          organizerEmail: true,
          duration: true,
          projects: { select: { projectId: true } },
        },
      })
    : [];

  const dominiosPropios = guard.interno
    ? buildInternalDomainsSet(
        await prisma.sessionCategory.findMany({ select: { domains: true, kind: true } }),
      )
    : new Set<string>();
  /* El tope va acá, ya filtrado. 300 es lo que una persona puede recorrer con el buscador sin
     que la respuesta pese; si alguna vez no alcanza, el síntoma es "no la encuentro" y no un
     documento mal armado. */
  const internas = huerfanas
    .filter((s) => esReunionDePuertasAdentro(s, dominiosPropios))
    .slice(0, 300);

  /* ── ¿De cuáles hay ALGO que leer? ──────────────────────────────────────────
     Medido el 2026-08-05: de las 6.435 reuniones ya ocurridas, **3.289 (el 51%) no tienen
     transcript, ni resumen, ni minuta**. Son reuniones que pasaron y de las que no quedó nada.
     Agregarlas a un handoff no aporta un solo dato, pero se ven idénticas a las que sí sirven —
     y el documento sale flaco sin que nadie entienda por qué.

     ⚠ Se pregunta en SQL crudo A PROPÓSITO. `transcript` es un TEXT largo y `summary` un blob
     JSON: pedírselos a Prisma para después mirar si están vacíos significaría traer megabytes al
     servidor para tirarlos. Acá viaja un booleano por sesión.

     El criterio es "hay ALGO", no "está completa": transcript con texto, o resumen, o una minuta
     escrita a mano. Con cualquiera de los tres la reunión tiene sustancia. */
  const idsVisibles = [...clientSessions, ...internas].map((s) => s.id);
  const conContenido = new Set<string>(
    idsVisibles.length === 0
      ? []
      : (
          await prisma.$queryRaw<{ id: string }[]>`
            SELECT s."id"
            FROM "FirefliesSession" s
            WHERE s."id" IN (${Prisma.join(idsVisibles)})
              AND (
                coalesce(length(s."transcript"), 0) > 0
                OR s."summary" IS NOT NULL
                OR EXISTS (SELECT 1 FROM "SessionMinute" m WHERE m."sessionId" = s."id")
              )`
        ).map((r) => r.id),
  );

  const candidates = [...clientSessions, ...internas]
    /* ⚠ Se saca `!excludedIds.has(s.id)` A PROPÓSITO, y volver a ponerlo parece la optimización
       más obvia del archivo ("no muestres lo que ya está excluido"). Reconstruye el incidente: la
       «X» sacaba la sesión de la lista **y del único buscador que podía traerla de vuelta**, así
       que un click la borraba de la pantalla entera sin dejar rastro. La pantalla se veía
       perfecta, con su lista y su buscador diciendo "No hay más sesiones".

       REGLA DE ESTE ENDPOINT: **el buscador nunca esconde algo que un click sacó.** Las excluidas
       vuelven con su marca y el botón dice "Reincluir" en vez de "Agregar". */
    .filter((s) => !feedingIds.has(s.id))
    .map((s) => {
      const cls = classifyHandoffSession(s.title, s.participants, s.organizerEmail, salesEmails);
      return {
        sessionId: s.id,
        title: s.title,
        date: s.date,
        participants: s.participants,
        /* El organizador venía leyéndose para clasificar y se tiraba antes de responder. Va: en
           muchas reuniones no figura entre los participantes, y sin él una sesión que organizó
           alguien de afuera se ve como si hubiéramos estado solos. */
        organizerEmail: s.organizerEmail,
        /* Separa una reunión de verdad de un no-show de dos minutos. Sale del mismo row. */
        duration: s.duration,
        applies: cls.include,
        // Por qué (no) aplica la regla — tooltip del modal (antes era opaco).
        reason: cls.reason,
        linkedElsewhere: s.projects.some((p) => p.projectId !== projectId),
        /* La sacó un humano de este proyecto. Viaja para que el botón diga "Reincluir" y la fila
           lo muestre: una excluida que vuelve al buscador sin marca se lee como una que nunca
           estuvo, y la persona no entiende por qué "reaparece". */
        excluidaAca: excludedIds.has(s.id),
        /* No hay transcript, ni resumen, ni minuta: la reunión ocurrió y no quedó nada. Se
           MUESTRA igual —esconderla sería otra desaparición silenciosa— pero marcada, porque
           agregarla no le suma un dato al documento. */
        sinContenido: !conContenido.has(s.id),
        /* Sin dueño: agregarla NO es solo vincularla, también la va a hacer de este cliente. El
           botón lo dice, porque es un efecto que no se ve desde el modal. */
        sinDuenio: internas.some((i) => i.id === s.id),
      };
    })
    /* Las que aplican primero y, dentro de cada bloque, lo más reciente arriba. El `date desc` ya
       no viene gratis: al concatenar el grupo interno se pierde, y en una lista de la que hay que
       elegir a mano el orden es la mitad de la usabilidad. */
    .sort((a, b) => Number(b.applies) - Number(a.applies) || b.date.getTime() - a.date.getTime());

  // Links de IA que ningún humano confirmó todavía (estado "revisado" DERIVADO:
  // curado ⇔ no existe link included+agent+reviewedAt=null). Alimenta el chip de
  // aviso "N sesiones sin revisar" del stepper (solo se muestra en multi-proyecto).
  const unreviewedCount = safeRows.filter(
    (r) => r.included && r.source === "agent" && r.reviewedAt === null,
  ).length;

  return NextResponse.json({ feeding, excluded, candidates, unreviewedCount });
}
