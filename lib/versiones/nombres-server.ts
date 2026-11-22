/**
 * lib/versiones/nombres-server.ts — el nombre de quien hizo cada versión (21 nov). La base guarda el correo; el popup
 * muestra el nombre del equipo. Un correo que no es del equipo se muestra tal cual. SERVIDOR.
 */
import { prisma } from "@/lib/db/prisma";
import type { VersionDelHistorial } from "./historial";

export interface VersionConNombre extends VersionDelHistorial {
  /** «Andrés Mora», «Nexus» o el correo; null en la actual sin guardar. */
  quien: string | null;
}

export async function conNombres(versiones: readonly VersionDelHistorial[]): Promise<VersionConNombre[]> {
  const correos = [...new Set(versiones.map((v) => v.creadaPor?.toLowerCase()).filter((c): c is string => !!c))];
  const equipo = correos.length
    ? await prisma.teamMember.findMany({ where: { email: { in: correos, mode: "insensitive" } }, select: { email: true, name: true } })
    : [];
  const nombre = new Map(equipo.map((m) => [m.email.toLowerCase(), m.name]));
  return versiones.map((v) => ({
    ...v,
    quien: v.creadaPor ? (nombre.get(v.creadaPor.toLowerCase()) ?? v.creadaPor) : v.en === null ? null : v.tipo === "ia" ? "Nexus" : null,
  }));
}
