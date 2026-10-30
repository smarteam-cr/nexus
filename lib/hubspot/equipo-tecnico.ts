/**
 * lib/hubspot/equipo-tecnico.ts — los correos del equipo técnico, para la regla del propietario (lib/hubspot/encargados.ts).
 * Sin `server-only`: lo usa el espejo, que también corre desde scripts.
 */
import { prisma } from "@/lib/db/prisma";
import { esDelEquipoTecnico } from "./encargados";

/** Los correos del equipo técnico (el rol en Nexus), en minúsculas. Con los de baja: lo que llevaron sigue siendo técnico. */
export async function correosDelEquipoTecnico(): Promise<Set<string>> {
  const filas = await prisma.teamMember.findMany({ select: { email: true, roleEnum: true } });
  return new Set(filas.filter((m) => esDelEquipoTecnico(m.roleEnum)).map((m) => m.email.trim().toLowerCase()));
}
