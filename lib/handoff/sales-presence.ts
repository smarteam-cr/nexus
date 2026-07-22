/**
 * lib/handoff/sales-presence.ts
 *
 * "Ventas en la sala" para la relevancia del handoff/business-case. Por defecto es el
 * equipo con `area ∈ {Sales, Ventas}`, PERO en Smarteam hay roles mixtos: gente de otra
 * área que hace PREVENTA TÉCNICA (acompaña a un vendedor como soporte). Esos deben contar
 * como presencia de ventas para que sus sesiones alimenten los handoffs. Se listan acá.
 *
 * Fuente ÚNICA del criterio — la usan lib/handoff/feeding.ts, lib/business-cases/feeding.ts,
 * session-candidates y la generación (analyze/route.ts). Upgrade futuro: una columna
 * `TeamMember.countsAsSales` gestionable desde /team (hoy, lista mantenida en código).
 */
import { prisma } from "@/lib/db/prisma";

/** Emails (lowercase) que cuentan como ventas aunque su área no sea Sales/Ventas (preventa técnica). */
export const PRESALES_EMAILS = new Set<string>([
  "asalas@smarteamcr.com", // Alejandro Salas — preventa técnica (rol DEV)
]);

/** ¿Este miembro cuenta como presencia de ventas? (área de ventas o preventa técnica). */
export function isSalesPresence(m: { email: string; area: string | null }): boolean {
  return m.area === "Sales" || m.area === "Ventas" || PRESALES_EMAILS.has(m.email.toLowerCase());
}

/** Set de emails (lowercase) que cuentan como "Ventas en la sala": área de ventas ∪ preventa. */
export async function salesPresenceEmails(): Promise<Set<string>> {
  const rows = await prisma.teamMember.findMany({
    where: { area: { in: ["Sales", "Ventas"] } },
    select: { email: true },
  });
  const set = new Set(rows.map((r) => r.email.toLowerCase()));
  for (const e of PRESALES_EMAILS) set.add(e);
  return set;
}
