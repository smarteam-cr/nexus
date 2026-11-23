/**
 * lib/conector-claude/persona-server.ts — quién pregunta por el conector. SERVER-ONLY.
 *
 * Los mismos filtros que la app aplica al entrar (`requireInternalUser`): un `AppUser` INTERNO, con su miembro del
 * equipo y sin desactivar. «Ver como» nunca se aplica: el conector es siempre la persona misma.
 *
 * Fase 0: la persona sale del entorno (`NEXUS_CONECTOR_PERSONA_DE_PRUEBA`, por correo) y solo junto con el token de
 * prueba (./token-de-prueba.ts). En la fase 1 sale de la conexión guardada, por el id del `AppUser`.
 */
import "server-only";
import type { TeamMember } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/** El miembro del equipo que pregunta, o null si no puede usar el conector. */
export async function personaDelConector(q: { email: string }): Promise<TeamMember | null> {
  const email = q.email.trim().toLowerCase();
  if (!email) return null;
  const u = await prisma.appUser.findUnique({ where: { email }, include: { teamMember: true } });
  if (!u || u.kind !== "INTERNAL" || !u.teamMember || u.teamMember.deactivatedAt) return null;
  return u.teamMember;
}
