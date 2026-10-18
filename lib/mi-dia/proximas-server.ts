/**
 * lib/mi-dia/proximas-server.ts — las próximas reuniones de una cuenta para la ficha del cliente (fase 2.2,
 * 2026-10-17). SERVER-ONLY, solo lectura. La regla es pura: lib/mi-dia/proximas.ts.
 *
 * ¿Qué calendarios se leen? Los de la gente de Smarteam que trabaja la cuenta: los encargados de sus proyectos activos,
 * su vendedor en HubSpot, quienes tienen tareas abiertas con ella y quien mira. Solo personas activas del equipo y como
 * mucho `MAX_CALENDARIOS` (cada lectura va a Google y se guarda dos minutos por persona,
 * lib/mi-dia/calendario-server.ts). Más las reuniones planeadas en Tareas de la cuenta (`clase = "reunion"`, sin lo
 * «Solo para mí»), así se ven aunque el calendario de quien la agendó no se pueda leer.
 *
 * Quien llama ya verificó que la persona ve la cuenta.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { tareasDisponible } from "@/lib/tareas/servidor";
import { calendarioDeLosProximosDias } from "./calendario-server";
import { mapasDeEmpresas } from "./empresas-server";
import { DIAS_PARA_LA_REUNION } from "./constantes";
import { proximasDeLaCuenta, type ProximaReunionDeLaCuenta } from "./proximas";

/** Cuántos calendarios se leen para una cuenta, como mucho. */
export const MAX_CALENDARIOS = 8;

export interface ProximasDeLaCuenta {
  reuniones: (ProximaReunionDeLaCuenta & { vanDeSmarteam: string[] })[];
  /** Los nombres de la gente cuyo calendario se miró. */
  miradas: string[];
  /** Los nombres de la gente cuyo calendario no se pudo leer. */
  sinLeer: string[];
}

export async function proximasReunionesDeLaCuenta(clientId: string, quienMira: string, ahora = new Date()): Promise<ProximasDeLaCuenta> {
  const hasta = new Date(ahora.getTime() + DIAS_PARA_LA_REUNION * 86_400_000);
  const conTareas = await tareasDisponible();
  const [cliente, conTareasAbiertas, planeadas, internos] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: { hubspotOwnerEmail: true, projects: { where: { status: "active" }, select: { hubspotOwnerEmail: true } } } }),
    conTareas
      ? prisma.tarea.groupBy({
          by: ["responsableEmail"],
          where: { clientId, archivadaAt: null, estado: { in: ["pendiente", "en_curso"] }, privada: false, responsableEmail: { not: null } },
          _count: { _all: true },
          orderBy: { _count: { responsableEmail: "desc" } },
          take: MAX_CALENDARIOS,
        })
      : Promise.resolve([]),
    conTareas
      ? prisma.tarea.findMany({
          where: { clientId, clase: "reunion", archivadaAt: null, estado: { in: ["pendiente", "en_curso"] }, privada: false, reunionInicio: { gte: new Date(ahora.getTime() - 3_600_000), lte: hasta } },
          select: { id: true, numero: true, titulo: true, reunionInicio: true, responsableEmail: true, invitados: true },
          orderBy: { reunionInicio: "asc" },
          take: 20,
        })
      : Promise.resolve([]),
    mapasDeEmpresas(ahora).then((m) => m.internos),
  ]);
  const candidatos = [
    quienMira,
    ...(cliente?.projects ?? []).map((p) => p.hubspotOwnerEmail),
    cliente?.hubspotOwnerEmail,
    ...conTareasAbiertas.map((g) => g.responsableEmail),
  ]
    .filter((e): e is string => !!e)
    .map((e) => e.trim().toLowerCase());
  const unicos = [...new Set(candidatos)];
  const activos = await prisma.teamMember.findMany({ where: { email: { in: unicos, mode: "insensitive" }, deactivatedAt: null }, select: { email: true, name: true } });
  const nombreDe = new Map(activos.map((p) => [p.email.toLowerCase(), p.name]));
  const personas = unicos.filter((e) => nombreDe.has(e)).slice(0, MAX_CALENDARIOS);

  const calendarios = await Promise.all(personas.map(async (email) => ({ email, reuniones: (await calendarioDeLosProximosDias(email, ahora))?.reuniones ?? null })));
  const r = proximasDeLaCuenta(
    clientId,
    calendarios,
    planeadas.flatMap((t) => (t.reunionInicio ? [{ id: t.id, numero: t.numero, titulo: t.titulo, inicio: t.reunionInicio.toISOString(), responsableEmail: t.responsableEmail, invitados: t.invitados }] : [])),
    { ahora, internos },
  );
  // Los nombres de quienes van: los del equipo por su nombre; un correo de Smarteam que no es del equipo, tal cual.
  const faltan = [...new Set(r.reuniones.flatMap((x) => x.deSmarteam))].filter((e) => !nombreDe.has(e));
  if (faltan.length) {
    const otros = await prisma.teamMember.findMany({ where: { email: { in: faltan, mode: "insensitive" } }, select: { email: true, name: true } });
    for (const p of otros) nombreDe.set(p.email.toLowerCase(), p.name);
  }
  return {
    reuniones: r.reuniones.map((x) => ({ ...x, vanDeSmarteam: x.deSmarteam.map((e) => nombreDe.get(e) ?? e) })),
    miradas: personas.map((e) => nombreDe.get(e) ?? e),
    sinLeer: r.sinLeer.map((e) => nombreDe.get(e) ?? e),
  };
}
