/**
 * lib/cs/alertas-del-pase-server.ts — las alertas de una cuenta cuando cambia quien la lleva (2026-10-19). SERVIDOR.
 *
 * Una alerta no tiene dueña: le llega a quien lleva la cuenta (se calcula). Lo único que queda de la persona anterior es
 * «la vi» (`SEEN` + `seenByEmail`): con eso el encargado nuevo la encontraba como ya vista sin haberla visto nunca. Las
 * que vio la persona anterior y siguen abiertas vuelven a «sin ver». Las resueltas o descartadas no se tocan: son
 * decisiones, no lecturas.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";

export async function reabrirAlertasVistasPor(clientId: string, de: readonly string[], o: { simular?: boolean } = {}): Promise<number> {
  const correos = [...new Set(de.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (correos.length === 0) return 0;
  const where = { clientId, status: "SEEN" as const, seenByEmail: { in: correos, mode: "insensitive" as const } };
  if (o.simular) return prisma.csAlert.count({ where });
  const r = await prisma.csAlert.updateMany({ where, data: { status: "OPEN", seenAt: null, seenByEmail: null } });
  return r.count;
}
