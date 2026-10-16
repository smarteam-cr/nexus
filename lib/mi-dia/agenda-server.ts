/**
 * lib/mi-dia/agenda-server.ts — la agenda de hoy de una persona, con la empresa de cada reunión (etapa 4c de
 * docs/mi-dia-plan.md). Solo lee: el calendario de la persona (con el permiso de siempre) y la base.
 *
 * La empresa la decide lib/mi-dia/agenda.ts con los contactos de HubSpot (lib/contactos) y los dominios registrados de
 * los clientes y prospectos. No muestra nada de la empresa más que su nombre: el resumen se abre con «Preparar», que
 * pide acceso al cliente.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { modeloDisponible } from "@/lib/db/esquema";
import { eventosEntre, type MotivoSinAgenda } from "@/lib/google/agenda-de-la-empresa";
import { dominiosDeLaCasa } from "@/lib/sessions/reuniones-para-seguimiento";
import { agendaDelDia, limitesDelDiaCR, type ReunionDeHoy } from "./agenda";

export interface ReunionDeLaAgenda extends ReunionDeHoy {
  /** El nombre de cada empresa de la reunión, por id. */
  nombres: Record<string, string>;
}

export interface AgendaDeHoy {
  estado: "ok" | MotivoSinAgenda;
  dia: string;
  reuniones: ReunionDeLaAgenda[];
}

export async function agendaDeHoy(email: string, ahora = new Date()): Promise<AgendaDeHoy> {
  const { dia, desde, hasta } = limitesDelDiaCR(ahora);
  const eventos = await eventosEntre(email, desde, hasta);
  if (!eventos.ok) return { estado: eventos.motivo, dia, reuniones: [] };

  const [clientes, contactos, internos] = await Promise.all([
    prisma.client.findMany({ where: { kind: { in: ["CLIENTE", "PROSPECTO"] } }, select: { id: true, name: true, emailDomains: true } }),
    modeloDisponible(prisma.contactoDeHubspot)
      ? prisma.contactoDeHubspot.findMany({ where: { vigente: true, email: { not: null } }, select: { email: true, clientId: true } }).catch(() => [])
      : Promise.resolve([]),
    dominiosDeLaCasa(),
  ]);
  const porDominio = new Map<string, string[]>();
  for (const c of clientes) {
    for (const d of c.emailDomains ?? []) {
      const k = d.trim().toLowerCase();
      if (k) porDominio.set(k, [...new Set([...(porDominio.get(k) ?? []), c.id])]);
    }
  }
  const porCorreo = new Map<string, string[]>();
  for (const c of contactos) {
    if (!c.email) continue;
    porCorreo.set(c.email, [...new Set([...(porCorreo.get(c.email) ?? []), c.clientId])]);
  }
  const nombreDe = new Map(clientes.map((c) => [c.id, c.name]));
  const reuniones = agendaDelDia(eventos.datos, { porCorreo, porDominio, internos }).map((r) => ({
    ...r,
    nombres: Object.fromEntries(r.empresas.map((id) => [id, nombreDe.get(id) ?? "Empresa"])),
  }));
  return { estado: "ok", dia, reuniones };
}
