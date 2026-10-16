/**
 * lib/contactos/lectura-server.ts — lo que se lee de la copia de contactos y tickets de HubSpot (etapa 6a de
 * docs/mi-dia-plan.md). Solo lectura.
 *
 *   · `personasYTicketsDe`: las personas de una cuenta, con cuándo estuvieron en una reunión por última vez (cruzando el
 *     correo de los invitados con las reuniones del cliente, por la regla única de pertenencia), y sus tickets.
 *   · `invitadosDe`: quién estuvo en una reunión, con nombre y cargo. Solo con los contactos del cliente de esa reunión:
 *     nunca se le pone a un invitado el nombre de un contacto de otro cliente.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { modeloDisponible } from "@/lib/db/esquema";
import { belongsToClient, whereBelongsToClient } from "@/lib/sessions/project-sources";
import { invitadosDeLaReunion, type Invitado } from "./reglas";

const DIA_MS = 86_400_000;
/** Cuántos días de reuniones se miran para decir cuándo estuvo cada persona. */
export const DIAS_DE_REUNIONES_DE_LAS_PERSONAS = 365;
/** Los tickets cerrados que se muestran: los de los últimos 90 días. */
export const DIAS_DE_TICKETS_CERRADOS = 90;

export interface PersonaDeLaCuenta {
  id: string;
  hubspotId: string;
  nombre: string;
  email: string | null;
  cargo: string | null;
  duenoEmail: string | null;
  /** ISO: lo último que se registró con esta persona en HubSpot. */
  ultimoContactoEnHubspot: string | null;
  /** ISO: la última reunión de Nexus con el cliente en la que estuvo. */
  ultimaReunion: string | null;
  /** En cuántas reuniones con el cliente estuvo en los últimos 90 días. */
  reuniones90: number;
}

export interface TicketDeLaCuenta {
  id: string;
  hubspotId: string;
  asunto: string;
  pipeline: string | null;
  etapa: string | null;
  abierto: boolean;
  prioridad: string | null;
  duenoEmail: string | null;
  creado: string | null;
  cerrado: string | null;
}

export interface PersonasYTickets {
  hayTabla: boolean;
  personas: PersonaDeLaCuenta[];
  tickets: TicketDeLaCuenta[];
  /** ISO: la última vez que la copia pasó por esta cuenta. */
  copiadoAt: string | null;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export async function personasYTicketsDe(clientId: string, ahora = new Date()): Promise<PersonasYTickets> {
  if (!modeloDisponible(prisma.contactoDeHubspot) || !modeloDisponible(prisma.ticketDeHubspot)) {
    return { hayTabla: false, personas: [], tickets: [], copiadoAt: null };
  }
  const desde = new Date(ahora.getTime() - DIAS_DE_REUNIONES_DE_LAS_PERSONAS * DIA_MS);
  const hace90 = new Date(ahora.getTime() - 90 * DIA_MS);
  const [contactos, tickets, reuniones] = await Promise.all([
    prisma.contactoDeHubspot.findMany({ where: { clientId, vigente: true } }),
    prisma.ticketDeHubspot.findMany({
      where: { clientId, vigente: true, OR: [{ abierto: true }, { cerradoEnHubspot: { gte: new Date(ahora.getTime() - DIAS_DE_TICKETS_CERRADOS * DIA_MS) } }] },
      orderBy: [{ abierto: "desc" }, { creadoEnHubspot: "desc" }],
      take: 60,
    }),
    // Solo las reuniones que ya ocurrieron: una agendada no dice que la persona estuvo.
    prisma.firefliesSession.findMany({
      where: { ...whereBelongsToClient(clientId), date: { gte: desde, lte: ahora } },
      select: { resolvedClientId: true, manualClientId: true, date: true, participants: true },
    }),
  ]).catch((e: unknown) => {
    if (e && typeof e === "object" && "code" in e && (e.code === "P2021" || e.code === "P2022")) return null;
    throw e;
  }) ?? [null, null, null];
  if (!contactos || !tickets || !reuniones) return { hayTabla: false, personas: [], tickets: [], copiadoAt: null };

  const ultima = new Map<string, Date>();
  const en90 = new Map<string, number>();
  for (const r of reuniones) {
    if (!belongsToClient(r, clientId)) continue;
    for (const p of new Set(r.participants.map((x) => x.trim().toLowerCase()))) {
      if (!ultima.has(p) || r.date > ultima.get(p)!) ultima.set(p, r.date);
      if (r.date >= hace90) en90.set(p, (en90.get(p) ?? 0) + 1);
    }
  }

  const personas: PersonaDeLaCuenta[] = contactos
    .map((c) => ({
      id: c.id,
      hubspotId: c.hubspotId,
      nombre: c.nombre,
      email: c.email,
      cargo: c.cargo,
      duenoEmail: c.duenoEmail,
      ultimoContactoEnHubspot: iso(c.ultimoContactoAt),
      ultimaReunion: c.email ? iso(ultima.get(c.email) ?? null) : null,
      reuniones90: c.email ? (en90.get(c.email) ?? 0) : 0,
    }))
    // Primero quien estuvo en una reunión hace menos; después lo último en HubSpot; después por nombre.
    .sort(
      (a, b) =>
        (b.ultimaReunion ?? "").localeCompare(a.ultimaReunion ?? "") ||
        (b.ultimoContactoEnHubspot ?? "").localeCompare(a.ultimoContactoEnHubspot ?? "") ||
        a.nombre.localeCompare(b.nombre),
    );

  const copiados = [...contactos.map((c) => c.copiadoAt), ...tickets.map((t) => t.copiadoAt)];
  return {
    hayTabla: true,
    personas,
    tickets: tickets.map((t) => ({
      id: t.id,
      hubspotId: t.hubspotId,
      asunto: t.asunto,
      pipeline: t.pipeline,
      etapa: t.etapa,
      abierto: t.abierto,
      prioridad: t.prioridad,
      duenoEmail: t.duenoEmail,
      creado: iso(t.creadoEnHubspot),
      cerrado: iso(t.cerradoEnHubspot),
    })),
    copiadoAt: copiados.length ? iso(new Date(Math.max(...copiados.map((d) => d.getTime())))) : null,
  };
}

/**
 * Los invitados de una reunión con nombre y cargo. `clientId` es el DUEÑO de la reunión (`duenoDeLaSesion`): solo sus
 * contactos ponen nombre. Sin dueño, solo se reconoce al equipo.
 */
export async function invitadosDe(participantes: readonly string[], clientId: string | null): Promise<Invitado[]> {
  const correos = [...new Set(participantes.map((p) => p.trim().toLowerCase()).filter(Boolean))];
  if (correos.length === 0) return [];
  const [equipo, contactos] = await Promise.all([
    prisma.teamMember.findMany({ where: { email: { in: correos, mode: "insensitive" } }, select: { email: true, name: true } }),
    clientId && modeloDisponible(prisma.contactoDeHubspot)
      ? prisma.contactoDeHubspot
          .findMany({ where: { clientId, email: { in: correos } }, orderBy: { vigente: "desc" }, select: { email: true, nombre: true, cargo: true } })
          .catch(() => [])
      : Promise.resolve([]),
  ]);
  const mapaEquipo = new Map(equipo.map((m) => [m.email.toLowerCase(), m.name]));
  const mapaContactos = new Map<string, { nombre: string; cargo: string | null }>();
  for (const c of contactos) if (c.email && !mapaContactos.has(c.email)) mapaContactos.set(c.email, { nombre: c.nombre, cargo: c.cargo });
  return invitadosDeLaReunion(participantes, mapaEquipo, mapaContactos);
}
