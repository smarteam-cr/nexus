/**
 * lib/sessions/reunion-para-su-pagina.ts — lo que la página de una reunión necesita saber de las OTRAS reuniones del
 * mismo cliente y de su lectura. Lector del CHOKEPOINT. SERVIDOR. Ficha G (2026-10-17).
 *
 * lib/seguimiento no lee `FirefliesSession` por su cuenta (invariante #1): pasa por acá, con la misma regla de dueño
 * que el resto de Nexus (`resolvedClientId`, el manual solo si no hay).
 *
 *   · `siguiente`: la primera reunión del mismo dueño que empieza después de que esta terminó (no de puertas adentro).
 *     Si ya existe, la próxima reunión sugerida lo dice.
 *   · `planeada`: la próxima reunión que OTRA reunión del mismo dueño dejó agendada cerca de la hora de esta (±3 horas):
 *     su título y su objetivo son parte de la agenda de esta.
 *   · `lectura`: el estado de su lectura de seguimiento (lib/lecturas), para los avisos.
 * Desde acá nunca se escribe nada.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esReunionDePuertasAdentro } from "./candidatas-internas";
import { dominiosDeLaCasa } from "./reuniones-para-seguimiento";
import { duenoDeLaSesion, getClientSessions } from "./project-sources";

/** Cuánto se acepta entre la hora con que se agendó una reunión y la hora en que de verdad empezó. */
export const VENTANA_DE_LA_PLANEADA_MS = 3 * 3_600_000;

export interface AlrededorDeLaReunion {
  siguiente: { id: string; titulo: string; fecha: string } | null;
  planeada: { reunionId: string; reunionTitulo: string; reunionFecha: string; titulo: string | null; objetivo: string | null } | null;
  lectura: { estado: string | null; error: string | null } | null;
}

/**
 * Las reuniones que PUEDEN ser de un dueño (el resuelto o el manual): solo achica la consulta. Quién es el dueño lo
 * decide después `duenoDeLaSesion`, la regla única (el manual solo si no hay resuelto): acá no se repite.
 */
function candidatasDelDueno(dueno: string) {
  return { OR: [{ resolvedClientId: dueno }, { manualClientId: dueno }] };
}

export async function alrededorDeLaReunion(o: { sessionId: string; dueno: string | null; fecha: Date; duracionMin: number }): Promise<AlrededorDeLaReunion> {
  const fin = new Date(o.fecha.getTime() + Math.max(0, o.duracionMin) * 60_000);
  const [lectura, siguientes, planeadas, dominios] = await Promise.all([
    prisma.lecturaDeReunion
      .findUnique({ where: { sessionId: o.sessionId }, select: { seguimientoEstado: true, seguimientoError: true } })
      .catch(() => null),
    o.dueno
      ? prisma.firefliesSession.findMany({
          where: { AND: [candidatasDelDueno(o.dueno), { id: { not: o.sessionId } }, { date: { gte: fin } }] },
          orderBy: { date: "asc" },
          take: 10,
          select: { id: true, title: true, date: true, participants: true, organizerEmail: true, resolvedClientId: true, manualClientId: true },
        })
      : Promise.resolve([]),
    o.dueno
      ? prisma.seguimientoDeReunion
          .findMany({
            where: {
              proximaEstado: "agendada",
              sessionId: { not: o.sessionId },
              proximaInicio: { gte: new Date(o.fecha.getTime() - VENTANA_DE_LA_PLANEADA_MS), lte: new Date(o.fecha.getTime() + VENTANA_DE_LA_PLANEADA_MS) },
              session: { ...candidatasDelDueno(o.dueno), date: { lt: o.fecha } },
            },
            take: 10,
            select: {
              proximaTitulo: true,
              proximaObjetivo: true,
              proximaInicio: true,
              session: { select: { id: true, title: true, date: true, resolvedClientId: true, manualClientId: true } },
            },
          })
          .catch(() => [])
      : Promise.resolve([]),
    dominiosDeLaCasa(),
  ]);

  const siguiente =
    siguientes.find(
      (s) => duenoDeLaSesion(s) === o.dueno && !esReunionDePuertasAdentro({ participants: s.participants, organizerEmail: s.organizerEmail }, dominios),
    ) ?? null;
  // La más cercana a la hora de esta reunión, entre las que de verdad son del mismo dueño.
  const planeada =
    planeadas
      .filter((p) => duenoDeLaSesion(p.session) === o.dueno)
      .sort(
      (a, b) => Math.abs((a.proximaInicio?.getTime() ?? 0) - o.fecha.getTime()) - Math.abs((b.proximaInicio?.getTime() ?? 0) - o.fecha.getTime()),
    )[0] ?? null;

  return {
    siguiente: siguiente ? { id: siguiente.id, titulo: siguiente.title, fecha: siguiente.date.toISOString() } : null,
    planeada: planeada
      ? {
          reunionId: planeada.session.id,
          reunionTitulo: planeada.session.title,
          reunionFecha: planeada.session.date.toISOString(),
          titulo: planeada.proximaTitulo,
          objetivo: planeada.proximaObjetivo,
        }
      : null,
    lectura: lectura ? { estado: lectura.seguimientoEstado, error: lectura.seguimientoError } : null,
  };
}

/**
 * La reunión para su correo de seguimiento, por el CHOKEPOINT (`getClientSessions` con `ids`): solo si es del cliente
 * `dueno` y ya empezó. Con su duración y su transcripción. null si no.
 */
export async function reunionParaElCorreo(
  sessionId: string,
  dueno: string,
): Promise<{
  id: string;
  titulo: string;
  fecha: Date;
  duracionMin: number;
  participantes: string[];
  organizador: string | null;
  transcripcion: string | null;
} | null> {
  const [s] = await getClientSessions(dueno, { ids: [sessionId] });
  if (!s) return null;
  const fila = await prisma.firefliesSession.findUnique({ where: { id: s.id }, select: { duration: true, transcript: true, organizerEmail: true } });
  return {
    id: s.id,
    titulo: s.title,
    fecha: new Date(s.date),
    duracionMin: Math.round(fila?.duration ?? 0),
    participantes: s.participants,
    // Para juzgar «de puertas adentro» igual que la página de la reunión (con el organizador).
    organizador: fila?.organizerEmail ?? null,
    transcripcion: fila?.transcript ?? null,
  };
}
