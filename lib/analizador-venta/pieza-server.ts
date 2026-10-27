/**
 * lib/analizador-venta/pieza-server.ts — lo que necesitan la pieza «Análisis» de la preventa (S5) y «Cómo trabajaste esta
 * sesión» (S4), 2026-10-27. SERVIDOR. Solo lectura, sin IA.
 *
 * ⛔ Un solo cliente (invariante 1, INV57): las reuniones salen del chokepoint (`getClientSessions` de la empresa de la
 * preventa) y de esas quedan las de venta (reglas.ts), con su análisis vigente, su revisión y quién habló. Todas las
 * reuniones de venta con la empresa, de la más vieja a la más nueva: las de exploración y también las de propuesta (la
 * pantalla las nombra con la sesión de la preventa a la que pertenecen).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getClientSessions } from "@/lib/sessions/project-sources";
import { reunionesDeVenta, type ReunionDeVentaVista } from "./reuniones-de-venta-server";

/** Hasta cuánto atrás se mira (dos años): una preventa no dura más. */
const DIAS_DE_LA_HISTORIA = 730;
/** Tope de reuniones de venta de una empresa (nunca se llega: unas 22 por cliente, medido en agosto). */
const MAX_REUNIONES = 500;

export interface AnalisisDelProspecto {
  reuniones: ReunionDeVentaVista[];
  /** El nombre de cada persona del equipo, por su correo (quién comentó, quién confirmó). */
  nombres: Record<string, string>;
}

export async function analisisDelProspecto(clientId: string, ahora = new Date()): Promise<AnalisisDelProspecto> {
  const [empresas, equipo] = await Promise.all([
    reunionesDeVenta({ dias: DIAS_DE_LA_HISTORIA, ahora, clientId, completo: true }),
    prisma.teamMember.findMany({ select: { email: true, name: true } }),
  ]);
  const deVenta = empresas
    .filter((e) => e.id === clientId)
    .flatMap((e) => e.reuniones)
    .slice(0, MAX_REUNIONES);
  // Cada una pasa por el chokepoint POR SU ID: las de venta viejas de una cuenta con mucha entrega no quedan afuera.
  const propias = deVenta.length ? await getClientSessions(clientId, { ids: deVenta.map((r) => r.id), take: deVenta.length }) : [];
  const deLaEmpresa = new Set(propias.map((s) => s.id));
  const reuniones = deVenta.filter((r) => deLaEmpresa.has(r.id)).sort((a, b) => a.fecha.localeCompare(b.fecha));

  return { reuniones, nombres: Object.fromEntries(equipo.map((m) => [m.email.toLowerCase(), m.name])) };

}
