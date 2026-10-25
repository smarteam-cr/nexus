/**
 * lib/clients/personas-de-la-empresa-server.ts — las personas de cada empresa: la copia desde sus fuentes, el rol que
 * dice el equipo y la lectura (R6, 2026-10-25). SERVIDOR. El ÚNICO escritor de `PersonaDeLaEmpresa`.
 *
 * La copia junta, de UNA empresa: sus contactos de HubSpot (la copia de cada hora, `ContactoDeHubspot`), las personas de
 * los cuestionarios de sus proyectos y los participantes de sus reuniones, que se leen SOLO por el chokepoint
 * (lib/sessions/project-sources.ts › getClientSessions, invariante 1). La regla de quién entra es pura
 * (personas-de-la-empresa.ts). Nunca borra una fila: la que ya no sale de ninguna fuente queda `vigente = false`. Nunca
 * toca el rol: lo dice una persona del equipo (`decidirRol`).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getClientSessions, genteCompartidaConOtrosClientes } from "@/lib/sessions/project-sources";
import { dominioDelSitio } from "./datos-de-la-empresa";
import { aMirarSiEsCompartido, cambiosDePersona, ROLES_DE_PERSONA, unirPersonas, type RolDePersona } from "./personas-de-la-empresa";

/** Cuántas reuniones de la empresa se miran (las más recientes): alcanza para saber quién va. */
const REUNIONES_QUE_SE_MIRAN = 300;

export interface ResultadoDeLaCopiaDePersonas {
  creadas: number;
  actualizadas: number;
  deBaja: number;
  /** Las que quedarían (para el simulacro). */
  personas: { correo: string; nombre: string | null; origenes: string[]; reuniones: number }[];
}

export async function copiarPersonasDeLaEmpresa(clientId: string, o: { apply: boolean }): Promise<ResultadoDeLaCopiaDePersonas> {
  const empresa = await prisma.client.findUnique({ where: { id: clientId }, select: { emailDomains: true, sitioWeb: true } });
  if (!empresa) throw new Error("La empresa no existe.");
  const [contactos, cuestionarios, sesiones, equipo, antes] = await Promise.all([
    prisma.contactoDeHubspot.findMany({ where: { clientId }, select: { id: true, email: true, nombre: true, cargo: true, vigente: true } }),
    prisma.cuestionarioResponsable.findMany({ where: { project: { clientId }, revokedAt: null }, select: { email: true, nombre: true, cargo: true } }),
    getClientSessions(clientId, { take: REUNIONES_QUE_SE_MIRAN }),
    prisma.teamMember.findMany({ select: { email: true } }),
    prisma.personaDeLaEmpresa.findMany({ where: { clientId } }),
  ]);
  const dominiosDeLaEmpresa = [...empresa.emailDomains, ...(empresa.sitioWeb ? [dominioDelSitio(empresa.sitioWeb)] : [])];
  const compartidos = await genteCompartidaConOtrosClientes(clientId, aMirarSiEsCompartido(sesiones.flatMap((s) => s.participants), dominiosDeLaEmpresa));
  const unidas = unirPersonas({
    contactos,
    cuestionarios,
    reuniones: sesiones.map((s) => ({ fecha: new Date(s.date), participantes: s.participants })),
    dominiosDeLaEmpresa,
    correosDelEquipo: equipo.map((t) => t.email),
    compartidos,
  });

  const porCorreo = new Map(antes.map((p) => [p.correo, p]));
  const nuevas = unidas.filter((u) => !porCorreo.has(u.correo));
  const cambios = unidas.flatMap((u) => {
    const a = porCorreo.get(u.correo);
    const c = a ? cambiosDePersona(a, u) : null;
    return a && c ? [{ id: a.id, c }] : [];
  });
  const siguen = new Set(unidas.map((u) => u.correo));
  const deBaja = antes.filter((a) => a.vigente && !siguen.has(a.correo));

  if (o.apply) {
    await prisma.$transaction(async (tx) => {
      if (nuevas.length) await tx.personaDeLaEmpresa.createMany({ data: nuevas.map((u) => ({ clientId, ...u })), skipDuplicates: true });
      for (const { id, c } of cambios) await tx.personaDeLaEmpresa.update({ where: { id }, data: c });
      if (deBaja.length) await tx.personaDeLaEmpresa.updateMany({ where: { id: { in: deBaja.map((d) => d.id) } }, data: { vigente: false } });
    });
  }
  return {
    creadas: nuevas.length,
    actualizadas: cambios.length,
    deBaja: deBaja.length,
    personas: unidas.map((u) => ({ correo: u.correo, nombre: u.nombre, origenes: u.origenes, reuniones: u.reuniones })),
  };
}

/** El rol de una persona, dicho por alguien del equipo. null lo borra. */
export async function decidirRol(a: { clientId: string; personaId: string; rol: RolDePersona | null; ahora?: Date }): Promise<void> {
  if (a.rol !== null && !(ROLES_DE_PERSONA as readonly string[]).includes(a.rol)) throw new Error("Ese rol no existe.");
  const r = await prisma.personaDeLaEmpresa.updateMany({
    where: { id: a.personaId, clientId: a.clientId },
    data: { rol: a.rol, rolFuente: a.rol ? "persona" : null, rolAt: a.rol ? (a.ahora ?? new Date()) : null },
  });
  if (r.count !== 1) throw new Error("Esa persona no es de esta empresa.");
}

/** Las personas vigentes de una empresa, las que más van a las reuniones primero. */
export async function personasDeLaEmpresa(clientId: string) {
  return prisma.personaDeLaEmpresa.findMany({
    where: { clientId, vigente: true },
    orderBy: [{ reuniones: "desc" }, { correo: "asc" }],
    select: { id: true, correo: true, nombre: true, cargo: true, rol: true, rolFuente: true, lado: true, origenes: true, reuniones: true, ultimaReunionAt: true, contactoDeHubspotId: true },
  });
}
