/**
 * lib/sessions/quien-estuvo-server.ts — lee «Quién estuvo» de UNA reunión (2026-11-27). SERVIDOR.
 *
 * La regla vive pura en lib/sessions/quien-estuvo.ts. Esto solo junta los datos: los invitados de
 * `ParticipanteDeReunion`, los nombres del equipo, los contactos de HubSpot y los dominios del DUEÑO de la reunión
 * (`duenoDeLaSesion`, el chokepoint: nunca los de otro cliente). Quien llama ya comprobó que quien mira puede ver la
 * reunión. Sin el SQL de la columna `plataforma` o de los invitados, sigue con lo que haya (los participantes).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { DOMINIO_PROPIO } from "./dominio-propio";
import { buildInternalDomainsSet } from "./categorize";
import { duenoDeLaSesion } from "./project-sources";
import { armarQuienEstuvo, type FilaDeQuienEstuvo, type QuienEstuvo } from "./quien-estuvo";
import type { Plataforma } from "@/lib/google/plataforma-del-evento";
import { resumenDeLaReunionDeHubspot } from "@/lib/comunicaciones/lectura-server";

/**
 * El resumen del notetaker de HubSpot de una reunión de Zoom o Teams (U7: `ComunicacionDeHubspot` de tipo «reunion»),
 * ligado por el evento del calendario (el de la instancia o el de su serie) y SOLO si es del mismo dueño: una
 * comunicación de otro cliente nunca llega a esta reunión (invariante 1). Medido el 27 nov: 9 de 47 reuniones nuevas
 * en 30 días lo tienen. null = no hay.
 */
export async function resumenDeHubspotDe(o: { googleEventId: string | null; duenoId: string | null; fecha: Date }): Promise<{ texto: string; ocurrioAt: string } | null> {
  if (!o.googleEventId || !o.duenoId) return null;
  const c = await resumenDeLaReunionDeHubspot({ clientId: o.duenoId, googleEventId: o.googleEventId, fecha: o.fecha });
  return c ? { texto: c.texto, ocurrioAt: c.ocurrioAt.toISOString() } : null;
}

export async function quienEstuvoEn(sessionId: string): Promise<QuienEstuvo | null> {
  const sesion = await prisma.firefliesSession
    .findUnique({
      where: { id: sessionId },
      select: { participants: true, organizerEmail: true, resolvedClientId: true, manualClientId: true, plataforma: true, estadoDeConferencia: true },
    })
    .catch(async (e) => {
      if (!esquemaDesactualizado(e)) throw e;
      // Sin el SQL del 2026-11-27 (plataforma): la reunión es de Meet, como siempre.
      const s = await prisma.firefliesSession.findUnique({
        where: { id: sessionId },
        select: { participants: true, organizerEmail: true, resolvedClientId: true, manualClientId: true, estadoDeConferencia: true },
      });
      return s ? { ...s, plataforma: null } : null;
    });
  if (!sesion) return null;
  const dueno = duenoDeLaSesion(sesion);

  const filas: FilaDeQuienEstuvo[] = modeloDisponible(prisma.participanteDeReunion)
    ? await prisma.participanteDeReunion
        .findMany({ where: { sessionId }, select: { correo: true, esDelEquipo: true, respuesta: true, entro: true, minutos: true, nombre: true } })
        .catch((e) => {
          if (esquemaDesactualizado(e)) return [];
          throw e;
        })
    : [];

  const correos = [...new Set([...filas.map((f) => f.correo), ...sesion.participants, sesion.organizerEmail ?? ""].map((c) => c.trim().toLowerCase()).filter((c) => c.includes("@")))];
  const [miembros, contactos, categorias, cliente] = await Promise.all([
    correos.length ? prisma.teamMember.findMany({ where: { email: { in: correos, mode: "insensitive" } }, select: { email: true, name: true } }) : Promise.resolve([]),
    dueno && correos.length && modeloDisponible(prisma.contactoDeHubspot)
      ? prisma.contactoDeHubspot
          .findMany({ where: { clientId: dueno, email: { in: correos } }, orderBy: { vigente: "desc" }, select: { email: true, nombre: true, cargo: true } })
          .catch(() => [])
      : Promise.resolve([]),
    prisma.sessionCategory.findMany({ select: { domains: true, kind: true } }),
    dueno ? prisma.client.findUnique({ where: { id: dueno }, select: { emailDomains: true } }) : Promise.resolve(null),
  ]);
  const dominiosDelEquipo = buildInternalDomainsSet(categorias);
  if (dominiosDelEquipo.size === 0) dominiosDelEquipo.add(DOMINIO_PROPIO);
  const mapaContactos = new Map<string, { nombre: string; cargo: string | null }>();
  for (const c of contactos) if (c.email && !mapaContactos.has(c.email.toLowerCase())) mapaContactos.set(c.email.toLowerCase(), { nombre: c.nombre, cargo: c.cargo });

  return armarQuienEstuvo({
    filas,
    participantes: sesion.participants,
    organizador: sesion.organizerEmail,
    plataforma: (sesion.plataforma as Plataforma | null) ?? null,
    estadoDeConferencia: sesion.estadoDeConferencia,
    equipo: new Map(miembros.map((m) => [m.email.toLowerCase(), m.name])),
    contactos: mapaContactos,
    dominiosDelEquipo,
    dominiosDelCliente: new Set((cliente?.emailDomains ?? []).map((d) => d.trim().toLowerCase()).filter(Boolean)),
  });
}
